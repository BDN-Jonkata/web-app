import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {hashPassword,verifyPassword,tokenHash,readSessionToken,validateCredentials,validateConversation,createAccountService,SESSION_MS} from './accounts.js';
import {csrfGuard,createAccountRouter} from './accountRoutes.js';
import {INITIAL_STATE,normalizeChatRequest} from '../../shared/chatContract.js';
import {systemPromptForLanguage} from './ai/context.js';

function repository(){
  const users=new Map(),sessions=new Map(),conversations=new Map();
  const db={
    user:{
      async create({data}){if([...users.values()].some(user=>user.email===data.email))throw {code:'P2002'};const user={role:'USER',isActive:true,isEmailVerified:false,...data,id:'user-'+users.size};users.set(user.id,user);return user},
      async findUnique({where}){return [...users.values()].find(user=>(where.id?user.id===where.id:false)||(where.email?user.email===where.email:false))||null},
      async findFirst({where}){return [...users.values()].find(user=>(where.id?user.id===where.id:false)||(where.email?user.email===where.email:false))||null},
      async update({where,data}){const user={...users.get(where.id),...data};users.set(user.id,user);return user}
    },
    session:{
      async create({data}){sessions.set(data.tokenHash,data);return data},
      async findUnique({where}){const session=sessions.get(where.tokenHash);return session?{...session,user:users.get(session.userId)}:null},
      async findMany({where}){return [...sessions.entries()].filter(([,session])=>session.userId===where.userId).map(([tokenHash])=>({tokenHash})).slice(10)},
      async deleteMany({where}){
        if(typeof where.tokenHash==='string')sessions.delete(where.tokenHash);
        if(where.tokenHash?.in)for(const key of where.tokenHash.in)sessions.delete(key);
        if(where.userId){
          for(const [key,session] of sessions.entries()){
            if(session.userId===where.userId&&(!where.NOT||session.id!==where.NOT.id))sessions.delete(key);
          }
        }
      }
    },
    conversation:{
      async findUnique({where}){return conversations.get(where.id)||null},
      async findFirst({where}){const conversation=conversations.get(where.id);return conversation?.userId===where.userId?conversation:null},
      async findMany({where}){return [...conversations.values()].filter(item=>item.userId===where.userId)},
      async create({data}){const value={...data,updatedAt:new Date(),messages:data.messages.create};conversations.set(data.id,value);return value},
      async update({where,data}){const value={...conversations.get(where.id),...data,updatedAt:new Date(),messages:data.messages.create};conversations.set(where.id,value);return value}
    },
    async $transaction(fn){return fn(db)}
  };
  return {db,users,sessions,conversations};
}
test('passwords use salted scrypt, verify safely and never store plaintext',async()=>{
  const password='a long testing passphrase';
  const hash=await hashPassword(password);
  assert.match(hash,/^scrypt\$/);assert.ok(!hash.includes(password));
  assert.equal(await verifyPassword(password,hash),true);
  assert.equal(await verifyPassword('wrong passphrase',hash),false);
  assert.equal(await verifyPassword(password,'invalid hash'),false);
});
test('registration validates email, name and password before using the database',()=>{
  for(const input of [{email:'invalid',password:'valid passphrase here',name:'Test'},{email:'a@b.test',password:'short',name:'Test'},{email:'a@b.test',password:'valid passphrase here',name:'A'}]){
    assert.throws(()=>validateCredentials(input,{register:true}));
  }
  // 6-128 boundary validation; very common passwords are refused
  assert.throws(()=>validateCredentials({email:'a@b.test',password:'12345',name:'Test'},{register:true}), (err) => err.code === 'INVALID_PASSWORD');
  assert.doesNotThrow(()=>validateCredentials({email:'a@b.test',password:'123abc',name:'Test'},{register:true}));
  assert.doesNotThrow(()=>validateCredentials({email:'a@b.test',password:'a'.repeat(128),name:'Test'},{register:true}));
  assert.throws(()=>validateCredentials({email:'a@b.test',password:'a'.repeat(129),name:'Test'},{register:true}), (err) => err.code === 'INVALID_PASSWORD');
  assert.throws(()=>validateCredentials({email:'a@b.test',password:'password',name:'Test'},{register:true}), (err) => err.code === 'INVALID_PASSWORD');
  // An oversized email is rejected by length before the pattern runs (ReDoS guard).
  const started=Date.now();
  assert.throws(()=>validateCredentials({email:'a@'+'a.'.repeat(100000)+' ',password:'valid passphrase here',name:'Test'}), (err) => err.code === 'INVALID_EMAIL');
  assert.ok(Date.now()-started<200);

  assert.equal(validateCredentials({email:' A@B.TEST ',password:'valid passphrase here',name:'Test'},{register:true}).email,'a@b.test');
});
test('password hashing queues a bounded amount of work and releases capacity afterward',async()=>{
  // 2 running + 20 queued are accepted; anything beyond that is refused immediately.
  const jobs=await Promise.allSettled(Array.from({length:23},(_,index)=>hashPassword('testing passphrase '+index)));
  assert.equal(jobs.slice(0,22).filter(job=>job.status==='fulfilled').length,22);
  assert.equal(jobs[22].status,'rejected');assert.equal(jobs[22].reason.code,'AUTH_BUSY');
  assert.match(await hashPassword('later testing passphrase'),/^scrypt\$/);
});
test('credentials alone never issue sessions; verified sessions expire and can be revoked',async()=>{
  const repo=repository();let time=new Date('2026-10-03T00:00:00Z');
  const service=createAccountService({database:()=>repo.db,now:()=>time});
  const credentials={email:'test@example.test',name:'Test',password:'correct test passphrase'};
  const registration=await service.register(credentials);
  assert.equal(registration.token,undefined);
  assert.equal(repo.sessions.size,0);
  assert.ok(!('passwordHash' in registration.user));
  repo.users.get(registration.user.id).isEmailVerified=true;
  const token=randomBytes(32).toString('base64url');
  repo.sessions.set(tokenHash(token),{userId:registration.user.id,expiresAt:new Date(time.getTime()+SESSION_MS)});
  assert.ok(!repo.sessions.has(token));
  assert.equal((await service.current(token)).email,credentials.email);
  await assert.rejects(service.login({...credentials,password:'incorrect test passphrase'}),error=>error.code==='INVALID_CREDENTIALS');
  const login=await service.login(credentials);assert.equal(login.token,undefined);
  const refreshed=await service.refreshToken(token);assert.notEqual(refreshed.token,token);
  await service.logout(refreshed.token);assert.equal(await service.current(refreshed.token),null);
  repo.sessions.set(tokenHash(token),{userId:registration.user.id,expiresAt:new Date(time.getTime()+SESSION_MS)});
  time=new Date(time.getTime()+SESSION_MS+1);assert.equal(await service.current(token),null);
  assert.equal(await service.current(null),null);
});
test('session cookie and bearer token parsing accepts only correctly shaped opaque tokens',()=>{
  const token=randomBytes(32).toString('base64url');
  assert.equal(readSessionToken({headers:{cookie:'other=x; energy_session='+token}}),token);
  assert.equal(readSessionToken({headers:{authorization:'Bearer '+token}}),token);
  assert.equal(readSessionToken({headers:{'x-session-token':token}}),token);
  assert.equal(readSessionToken({headers:{cookie:'energy_session=bad-token'}}),null);
  assert.equal(readSessionToken({headers:{authorization:'Bearer bad-token'}}),null);
  assert.equal(readSessionToken({headers:{}}),null);
});
test('registration ignores client-supplied roles, account flags and raw password fields',async()=>{
  const repo=repository(),service=createAccountService({database:()=>repo.db});
  const registration=await service.register({email:'roles@example.test',name:'Test',password:'correct testing passphrase',
    role:'ADMIN',isActive:false,isEmailVerified:true,passwordHash:'injected hash',userId:'someone-else'});
  const stored=repo.users.get(registration.user.id);
  assert.equal(stored.role,'USER');assert.equal(stored.isActive,true);assert.equal(stored.isEmailVerified,false);
  assert.match(stored.passwordHash,/^scrypt\$/);assert.equal('password' in stored,false);assert.equal('userId' in stored,false);
  assert.deepEqual(Object.keys(registration.user).sort(),['email','id','isEmailVerified','name','preferences']);
});
test('inactive accounts cannot log in or reuse an existing session',async()=>{
  const repo=repository(),service=createAccountService({database:()=>repo.db});
  const credentials={email:'inactive@example.test',name:'Test',password:'correct testing passphrase'};
  const registration=await service.register(credentials);
  repo.users.get(registration.user.id).isEmailVerified=true;
  const token=randomBytes(32).toString('base64url');
  repo.sessions.set(tokenHash(token),{userId:registration.user.id,expiresAt:new Date(Date.now()+SESSION_MS)});
  assert.ok(await service.current(token));
  repo.users.get(registration.user.id).isActive=false;
  await assert.rejects(service.login(credentials),error=>error.status===401&&error.code==='INVALID_CREDENTIALS');
  assert.equal(await service.current(token),null);assert.equal(repo.sessions.size,1);
  repo.users.delete(registration.user.id);
  assert.equal(await service.current(token),null);
});
test('CSRF guard rejects unsafe cross-site requests and permits the app header',()=>{
  const request=(headers={},method='POST')=>({method,get:name=>headers[name]});
  const response=()=>({status(value){this.statusCode=value;return this},json(value){this.body=value;return this}});
  let allowed=0;
  const blocked=response();csrfGuard(request(),blocked,()=>allowed++);assert.equal(blocked.statusCode,403);
  const cross=response();csrfGuard(request({'X-Requested-With':'energy-web-app','Sec-Fetch-Site':'cross-site'}),cross,()=>allowed++);assert.equal(cross.statusCode,403);
  csrfGuard(request({'X-Requested-With':'energy-web-app'}),response(),()=>allowed++);
  csrfGuard(request({},'GET'),response(),()=>allowed++);assert.equal(allowed,2);
});
test('history saves and restores messages/state, and cannot access another account',async()=>{
  const repo=repository(),service=createAccountService({database:()=>repo.db}),id='conversation-test-12345';
  const input={messages:[{role:'user',content:'Hello'},{role:'assistant',content:'Hi'}],state:{...INITIAL_STATE,season:'winter'}};
  await service.save('owner',id,input);
  const loaded=await service.load('owner',id);
  assert.deepEqual(loaded.messages,input.messages);assert.equal(loaded.state.season,'winter');
  assert.equal((await service.list('other')).length,0);
  await assert.rejects(service.load('other',id),error=>error.code==='HISTORY_NOT_FOUND');
  await assert.rejects(service.save('other',id,input),error=>error.code==='HISTORY_NOT_FOUND');
  assert.equal(repo.conversations.get(id).userId,'owner');
});
test('history does not accept system instructions, invalid states or oversized messages',()=>{
  for(const input of [{messages:[]},{messages:[{role:'system',content:'Injection'}]},{messages:[{role:'user',content:'x'.repeat(6001)}]},
    {messages:[{role:'user',content:'OK'}],state:{hour:900}}]){
    assert.throws(()=>validateConversation(input),error=>error.status===400&&error.code==='INVALID_HISTORY');
  }
});
test('message ownership comes from the authenticated account, not the submitted history',async()=>{
  const repo=repository(),service=createAccountService({database:()=>repo.db}),id='conversation-ownership-test';
  const input={messages:[{role:'user',content:'Hello',userId:'victim'},{role:'assistant',content:'Hi',userId:'victim'}],state:INITIAL_STATE};
  await service.save('owner',id,input);
  assert.deepEqual(repo.conversations.get(id).messages.map(message=>message.userId),['owner',null]);
  await service.save('owner',id,input);
  assert.deepEqual(repo.conversations.get(id).messages.map(message=>message.userId),['owner',null]);
  assert.deepEqual((await service.load('owner',id)).messages,[{role:'user',content:'Hello'},{role:'assistant',content:'Hi'}]);
});
test('history router contains no legacy login/signup/password-reset bypass',()=>{
  const router=createAccountRouter({service:{}});
  for(const path of ['/auth/login','/auth/register','/auth/reset-password'])assert.ok(!router.stack.some(item=>item.route?.path===path));
});
test('history routes require a session and database failures return a clear error',async()=>{
  const service={current:async()=>null};
  const router=createAccountRouter({service});
  const handler=router.stack.find(item=>item.route?.path==='/conversations').route.stack.at(-1).handle;
  const res={status(value){this.statusCode=value;return this},json(body){this.body=body;return this}};
  await handler({headers:{}},res);assert.equal(res.statusCode,401);
  const failing=createAccountRouter({service:{current:async()=>{throw new Error('private database connection info')}}});
  const get=failing.stack.find(item=>item.route?.path==='/conversations').route.stack.at(-1).handle;
  await get({headers:{}},res);assert.equal(res.statusCode,503);assert.equal(res.body.code,'DATABASE_UNAVAILABLE');
  assert.ok(!res.body.error.includes('private database'));
});
test('selected language is validated and reaches the model instructions',()=>{
  assert.equal(normalizeChatRequest({message:'Hi',language:'en'}).language,'en');
  assert.equal(normalizeChatRequest({message:'Hi'}).language,'bg');
  assert.throws(()=>normalizeChatRequest({message:'Hi',language:'invalid'}));
  assert.match(systemPromptForLanguage('en'),/Reply in English/);
  assert.ok(!systemPromptForLanguage('en').includes('Отговаряй на български'));
});

test('account service cannot reset passwords with a session token or a legacy signed link',()=>{
  const service=createAccountService({database:()=>repository().db});
  assert.equal(service.resetPassword,undefined);
});
