import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmailAuthService,CHALLENGE_MS,readChallengeToken} from './emailAuth.js';
import {createAccountService,tokenHash,verifyPassword} from './accounts.js';
import {createEmailService,lookupLocation,requestMetadata} from './email.js';
import {authRepository} from './testing/authRepository.js';

const input={email:'person@example.test',name:'Петър',password:'initialPass123',preferences:{language:'bg'}};
function fixture(){
  const {db,tables}=authRepository();let time=new Date('2026-10-04T12:00:00Z'),deliveryFailed=false;
  const codes=[],notifications=[];
  const mail={ensureConfigured(){},async sendCode(data){if(deliveryFailed)throw Object.assign(Error('Mock failure'),{code:'EMAIL_UNAVAILABLE',status:503});codes.push(data)},
    async sendPasswordChanged(data){if(deliveryFailed)throw Error('Mock failure');notifications.push(data)}};
  const options={database:()=>db,now:()=>time,mail};
  return {db,tables,mail,codes,notifications,auth:createEmailAuthService(options),accounts:createAccountService(options),
    advance(ms){time=new Date(+time+ms)},fail(value=true){deliveryFailed=value}};
}
const lastCode=view=>view.codes.at(-1).code;
const rejects=(promise,code='INVALID_VERIFICATION')=>assert.rejects(promise,error=>error.code===code);

test('signup creates no session until a one-use emailed code is verified',async()=>{
  const view=fixture(),pending=await view.auth.register({...input,isEmailVerified:true,role:'ADMIN'});
  assert.equal(view.tables.session.size,0);assert.equal(pending.verificationRequired,true);
  const stored=[...view.tables.user.values()][0],challenge=view.tables.authChallenge.get(tokenHash(pending.challengeToken));
  assert.equal(stored.isEmailVerified,false);assert.equal(stored.role,'USER');assert.match(lastCode(view),/^\d{6}$/);
  assert.match(challenge.codeHash,/^[a-f0-9]{64}$/);assert.equal(challenge.code,undefined);assert.equal(challenge.challengeToken,undefined);
  assert.notEqual(challenge.tokenHash,pending.challengeToken);
  const completed=await view.auth.verify({token:pending.challengeToken,code:lastCode(view)});
  assert.equal(completed.user.isEmailVerified,true);assert.equal(view.tables.session.size,1);
  assert.ok(view.tables.session.has(tokenHash(completed.token)));assert.equal((await view.accounts.current(completed.token)).id,completed.user.id);
  await rejects(view.auth.verify({token:pending.challengeToken,code:lastCode(view)}));
});
test('login requires a fresh code even for an already verified account',async()=>{
  const view=fixture(),signup=await view.auth.register(input);
  await view.auth.verify({token:signup.challengeToken,code:lastCode(view)});view.advance(61000);
  await rejects(view.auth.login({...input,password:'wrongPass123'}),'INVALID_CREDENTIALS');
  const login=await view.auth.login(input);assert.equal(view.tables.session.size,1);
  const result=await view.auth.verify({token:login.challengeToken,code:lastCode(view)});
  assert.equal(view.tables.session.size,2);assert.ok(result.token);
});
test('five wrong codes lock the challenge; resending cannot reset attempts or extend expiry',async()=>{
  const view=fixture(),pending=await view.auth.register(input),original=lastCode(view);
  const wrong=original==='000000'?'000001':'000000';
  await rejects(view.auth.verify({token:pending.challengeToken,code:wrong}));view.advance(61000);
  const resent=await view.auth.resend(pending.challengeToken);
  assert.equal(+resent.expiresAt,+pending.expiresAt);
  assert.equal(view.tables.authChallenge.get(tokenHash(pending.challengeToken)).attempts,1);
  for(let i=1;i<5;i++)await rejects(view.auth.verify({token:pending.challengeToken,code:'not-a-code'}));
  await rejects(view.auth.verify({token:pending.challengeToken,code:lastCode(view)}));
  view.advance(61000);await rejects(view.auth.resend(pending.challengeToken));assert.equal(view.tables.session.size,0);
});
test('expired or wrong-browser codes cannot sign in',async()=>{
  const view=fixture(),pending=await view.auth.register(input);
  await rejects(view.auth.verify({token:'wrong-browser',code:lastCode(view)}));
  view.advance(CHALLENGE_MS);await rejects(view.auth.verify({token:pending.challengeToken,code:lastCode(view)}));
  assert.equal(view.tables.session.size,0);
});
test('resend observes cooldown, invalidates old code and limits sends',async()=>{
  const view=fixture(),pending=await view.auth.register(input);
  await rejects(view.auth.resend(pending.challengeToken),'EMAIL_RATE_LIMIT');
  view.advance(61000);const oldHash=view.tables.authChallenge.get(tokenHash(pending.challengeToken)).codeHash;
  await view.auth.resend(pending.challengeToken);assert.notEqual(view.tables.authChallenge.get(tokenHash(pending.challengeToken)).codeHash,oldHash);
  view.advance(61000);await view.auth.resend(pending.challengeToken);
  view.advance(61000);await rejects(view.auth.resend(pending.challengeToken),'EMAIL_RATE_LIMIT');
});
test('hourly budget per purpose survives new login challenges',async()=>{
  const view=fixture();await view.auth.register(input);
  for(let i=0;i<5;i++){view.advance(61000);await view.auth.login(input)}
  view.advance(61000);await rejects(view.auth.login(input),'EMAIL_RATE_LIMIT');assert.equal(view.codes.length,6);
});
test('a stranger spamming password recovery cannot lock the owner out of login',async()=>{
  const view=fixture();await view.auth.register(input);
  for(let i=0;i<5;i++){view.advance(61000);await view.auth.forgotPassword({email:input.email})}
  // Recovery is now throttled (silently, same response), but the owner can still sign in.
  view.advance(61000);const pending=await view.auth.login(input);
  assert.equal(pending.verificationRequired,true);assert.equal(view.codes.at(-1).purpose,'LOGIN');
});
test('wrong reset codes are counted across challenges and stop further recovery codes',async()=>{
  const view=fixture();await view.auth.register(input);
  for(let round=0;round<2;round++){
    view.advance(61000);const pending=await view.auth.forgotPassword({email:input.email});
    for(let i=0;i<5;i++)await rejects(view.auth.resetPassword({token:pending.challengeToken,code:'000000',password:'newPass123x',confirmPassword:'newPass123x'}));
  }
  const sent=view.codes.length;view.advance(61000);
  const silent=await view.auth.forgotPassword({email:input.email});
  assert.equal(silent.verificationRequired,true);assert.equal(view.codes.length,sent);
});
test('the account-wide email cap still stops mailbox flooding across purposes',async()=>{
  const view=fixture();await view.auth.register(input);
  for(let i=0;i<4;i++){view.advance(61000);await view.auth.login(input)}
  for(let i=0;i<5;i++){view.advance(61000);await view.auth.forgotPassword({email:input.email})}
  view.advance(61000);await rejects(view.auth.login(input),'EMAIL_RATE_LIMIT');
});
test('forgotten-password response and resend have the same shape for absent accounts',async()=>{
  const view=fixture();await view.auth.register(input);view.advance(61000);
  const real=await view.auth.forgotPassword({email:input.email}),fake=await view.auth.forgotPassword({email:'absent@example.test'});
  assert.deepEqual(Object.keys(real).sort(),Object.keys(fake).sort());
  assert.equal(view.codes.length,2);view.advance(61000);
  const a=await view.auth.resend(real.challengeToken),b=await view.auth.resend(fake.challengeToken);
  assert.deepEqual(Object.keys(a),Object.keys(b));assert.equal(view.codes.length,3);
  await rejects(view.auth.resetPassword({token:fake.challengeToken,code:'000000',password:'newPass123',confirmPassword:'newPass123'}));
});
test('password reset is purpose-bound, one-use, revokes sessions and queues a change alert',async()=>{
  const view=fixture(),signup=await view.auth.register(input);
  const login=await view.auth.verify({token:signup.challengeToken,code:lastCode(view)});view.advance(61000);
  const recovery=await view.auth.forgotPassword({email:input.email}),code=lastCode(view);
  await rejects(view.auth.verify({token:recovery.challengeToken,code}));
  await rejects(view.auth.resetPassword({token:recovery.challengeToken,code,password:'newPass123',confirmPassword:'mismatch'}),'PASSWORD_MISMATCH');
  const result=await view.auth.resetPassword({token:recovery.challengeToken,code,password:'newPass123',confirmPassword:'newPass123',metadata:{ip:'127.0.0.1',device:'Test browser'}});
  assert.equal(result.ok,true);assert.equal(result.notificationPending,false);assert.equal(view.tables.session.size,0);
  assert.equal(await view.accounts.current(login.token),null);
  assert.equal(view.notifications[0].ip,'127.0.0.1');assert.equal(view.notifications[0].device,'Test browser');assert.ok(view.notifications[0].changedAt);
  assert.ok(!JSON.stringify(view.notifications).includes('newPass123'));
  assert.equal(await verifyPassword('newPass123',[...view.tables.user.values()][0].passwordHash),true);
  await rejects(view.auth.resetPassword({token:recovery.challengeToken,code,password:'anotherPass123',confirmPassword:'anotherPass123'}));
  await rejects(view.auth.login(input),'INVALID_CREDENTIALS');
});
test('two concurrent verifications create only one session',async()=>{
  const view=fixture(),pending=await view.auth.register(input),request={token:pending.challengeToken,code:lastCode(view)};
  const results=await Promise.allSettled([view.auth.verify(request),view.auth.verify(request)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(view.tables.session.size,1);
});
test('two concurrent password resets consume the code only once and queue one alert',async()=>{
  const view=fixture();await view.auth.register(input);view.advance(61000);
  const recovery=await view.auth.forgotPassword({email:input.email});
  const request={token:recovery.challengeToken,code:lastCode(view),password:'newPass123',confirmPassword:'newPass123'};
  const results=await Promise.allSettled([view.auth.resetPassword(request),view.auth.resetPassword(request)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(view.tables.emailNotification.size,1);
});
test('email address changes invalidate older verification codes',async()=>{
  const view=fixture(),pending=await view.auth.register(input);
  [...view.tables.user.values()][0].email='changed@example.test';
  await rejects(view.auth.verify({token:pending.challengeToken,code:lastCode(view)}));
});
test('an alert-queue failure rolls back password changes and code consumption',async()=>{
  const view=fixture();await view.auth.register(input);view.advance(61000);
  const recovery=await view.auth.forgotPassword({email:input.email}),code=lastCode(view);
  view.db.emailNotification.create=async()=>{throw Error('Mock queue unavailable')};
  await assert.rejects(view.auth.resetPassword({token:recovery.challengeToken,code,password:'newPass123',confirmPassword:'newPass123'}));
  assert.equal(await verifyPassword(input.password,[...view.tables.user.values()][0].passwordHash),true);
  assert.equal(view.tables.authChallenge.get(tokenHash(recovery.challengeToken)).consumedAt,null);
});
test('reset succeeds if alert delivery fails; durable pending alert is retried',async()=>{
  const view=fixture();await view.auth.register(input);view.advance(61000);
  const recovery=await view.auth.forgotPassword({email:input.email}),code=lastCode(view);view.fail();
  const result=await view.auth.resetPassword({token:recovery.challengeToken,code,password:'newPass123',confirmPassword:'newPass123'});
  assert.equal(result.notificationPending,true);assert.equal(view.tables.emailNotification.size,1);
  view.fail(false);view.advance(61000);await view.auth.deliverPendingNotifications();
  assert.equal(view.notifications.length,1);assert.ok([...view.tables.emailNotification.values()][0].sentAt);
});
test('SMTP failure cannot create a login session and duplicate retry never overwrites an account',async()=>{
  const view=fixture();view.fail();
  // Delivery is deferred so a new and an existing email behave alike; a failed send just leaves the code to be resent.
  assert.equal((await view.auth.register(input)).verificationRequired,true);assert.equal(view.codes.length,0);assert.equal(view.tables.session.size,0);
  const before=[...view.tables.user.values()][0].passwordHash;view.fail(false);view.advance(61000);
  await view.auth.register(input);assert.equal(view.tables.user.size,1);assert.equal([...view.tables.user.values()][0].passwordHash,before);
  // A different password for an existing email looks like a normal signup (no account enumeration) but sends nothing.
  const sent=view.codes.length,fake=await view.auth.register({...input,password:'attackerPass123'});
  assert.equal(fake.verificationRequired,true);assert.ok(fake.challengeToken);assert.equal(view.codes.length,sent);
  assert.equal([...view.tables.user.values()][0].passwordHash,before);
});
test('inactive accounts and credentials changed after challenge cannot verify',async()=>{
  const view=fixture(),pending=await view.auth.register(input),user=[...view.tables.user.values()][0];
  user.isActive=false;await rejects(view.auth.verify({token:pending.challengeToken,code:lastCode(view)}));
  user.isActive=true;user.passwordHash='changed';await rejects(view.auth.verify({token:pending.challengeToken,code:lastCode(view)}));
  assert.equal(view.tables.session.size,0);
});
test('SMTP must be configured explicitly; templates escape untrusted names and never contain passwords',async()=>{
  assert.throws(()=>createEmailService({env:{}}).ensureConfigured(),error=>error.code==='EMAIL_NOT_CONFIGURED');
  const messages=[],mail=createEmailService({env:{},transport:{async sendMail(message){messages.push(message)}}});
  await mail.sendCode({email:input.email,name:'<img src=x>',code:'123456',purpose:'SIGNUP'});
  assert.ok(messages[0].html.includes('&lt;img'));assert.ok(!messages[0].html.includes('<img'));
  await mail.sendPasswordChanged({email:input.email,name:'Test',changedAt:'2026-10-04T12:00Z',ip:'127.0.0.1',device:'Test'});
  assert.match(messages[1].text,/Локална\/частна мрежа/);assert.match(messages[1].text,/127\.0\.0\.1/);
});
test('location lookup is optional, server-side, approximate and safely falls back',async()=>{
  let calls=0;
  const options={env:{IPINFO_TOKEN:'test',IPINFO_PLAN:'lookup'},fetchImpl:async(url,config)=>{calls++;assert.equal(config.headers.Authorization,'Bearer test');assert.match(url,/8\.8\.8\.8/);return {ok:true,json:async()=>({geo:{city:'Sofia',country:'Bulgaria'}})}}};
  assert.equal((await lookupLocation('127.0.0.1',options)).kind,'local');assert.equal(calls,0);
  assert.equal((await lookupLocation('8.8.8.8',{env:{}})).kind,'unknown');
  assert.deepEqual(await lookupLocation('8.8.8.8',options),{kind:'approximate',label:'Sofia, Bulgaria'});
  assert.equal((await lookupLocation('8.8.8.8',{...options,fetchImpl:async()=>{throw Error('offline')}})).kind,'unknown');
  assert.equal(requestMetadata({ip:'::ffff:127.0.0.1',headers:{'x-forwarded-for':'8.8.8.8','user-agent':'Browser'}}).ip,'127.0.0.1');
});
test('challenge cookie parsing ignores body tokens and malformed cookies',()=>{
  const token='a'.repeat(43);
  assert.equal(readChallengeToken({headers:{cookie:'energy_verification='+token},body:{token:'bad'}}),token);
  assert.equal(readChallengeToken({headers:{cookie:'energy_verification=bad'},body:{token}}),null);
});
test('decoy recovery challenges observe the same five-attempt lockout as real accounts',async()=>{
  const view=fixture(),fake=await view.auth.forgotPassword({email:'missing@example.test'});
  for(let i=0;i<5;i++)await rejects(view.auth.resetPassword({token:fake.challengeToken,code:'000000',password:'newPass123',confirmPassword:'newPass123'}));
  view.advance(61000);await rejects(view.auth.resend(fake.challengeToken));assert.equal(view.tables.user.size,0);
});
test('recovery request/resend does not wait for SMTP and therefore avoids account-existence timing leaks',async()=>{
  const view=fixture();await view.auth.register(input);view.advance(61000);
  let finish;view.mail.sendCode=()=>new Promise(resolve=>{finish=resolve});
  const recovery=await view.auth.forgotPassword({email:input.email});assert.equal(recovery.verificationRequired,true);finish();
  view.advance(61000);const resend=await view.auth.resend(recovery.challengeToken);assert.equal(resend.verificationRequired,true);finish();
});
