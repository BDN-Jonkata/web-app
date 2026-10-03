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
      async create({data}){if([...users.values()].some(user=>user.email===data.email))throw {code:'P2002'};const user={...data,id:'user-'+users.size};users.set(user.id,user);return user},
      async findUnique({where}){return [...users.values()].find(user=>user.email===where.email)||null},
      async update({where,data}){const user={...users.get(where.id),...data};users.set(user.id,user);return user}
    },
    session:{
      async create({data}){sessions.set(data.tokenHash,data);return data},
      async findUnique({where}){const session=sessions.get(where.tokenHash);return session?{...session,user:users.get(session.userId)}:null},
      async deleteMany({where}){sessions.delete(where.tokenHash)}
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
  assert.equal(validateCredentials({email:' A@B.TEST ',password:'valid passphrase here',name:'Test'},{register:true}).email,'a@b.test');
});
test('password hashing limits concurrent work and releases capacity afterward',async()=>{
  const jobs=await Promise.allSettled([hashPassword('first testing passphrase'),hashPassword('second testing passphrase'),hashPassword('third testing passphrase')]);
  assert.equal(jobs[0].status,'fulfilled');assert.equal(jobs[1].status,'fulfilled');
  assert.equal(jobs[2].status,'rejected');assert.equal(jobs[2].reason.code,'AUTH_BUSY');
  assert.match(await hashPassword('later testing passphrase'),/^scrypt\$/);
});
test('register, login, session expiry and logout use hashed opaque tokens',async()=>{
  const repo=repository();let time=new Date('2026-10-03T00:00:00Z');
  const service=createAccountService({database:()=>repo.db,now:()=>time});
  const credentials={email:'test@example.test',name:'Test',password:'correct test passphrase'};
  const registration=await service.register(credentials);
  assert.equal(registration.token.length,43);
  assert.ok(!('passwordHash' in registration.user));
  assert.ok(repo.sessions.has(tokenHash(registration.token)));
  assert.ok(!repo.sessions.has(registration.token));
  assert.equal((await service.current(registration.token)).email,credentials.email);
  await assert.rejects(service.login({...credentials,password:'incorrect test passphrase'}),error=>error.code==='INVALID_CREDENTIALS');
  const login=await service.login(credentials);assert.notEqual(login.token,registration.token);
  await service.logout(login.token);assert.equal(await service.current(login.token),null);
  time=new Date(time.getTime()+SESSION_MS+1);assert.equal(await service.current(registration.token),null);
  assert.equal(await service.current(null),null);
});
test('session cookie parsing accepts only correctly shaped opaque tokens',()=>{
  const token=randomBytes(32).toString('base64url');
  assert.equal(readSessionToken({headers:{cookie:'other=x; energy_session='+token}}),token);
  assert.equal(readSessionToken({headers:{cookie:'energy_session=bad-token'}}),null);
  assert.equal(readSessionToken({headers:{}}),null);
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
test('login route sets an HttpOnly cookie, never a browser-readable session token',async()=>{
  const token=randomBytes(32).toString('base64url'),service={login:async()=>({token,user:{id:'owner',name:'Test'}}),logout:async()=>{}};
  const router=createAccountRouter({service,secure:true});
  const layer=router.stack.find(item=>item.route?.path==='/auth/login');
  const handler=layer.route.stack.at(-1).handle;
  const req={body:{},headers:{}},res={cookie(name,value,options){this.cookieInfo={name,value,options};return this},status(){return this},json(body){this.body=body;return this}};
  await handler(req,res);
  assert.equal(res.cookieInfo.options.httpOnly,true);assert.equal(res.cookieInfo.options.secure,true);
  assert.equal(res.cookieInfo.options.sameSite,'strict');
  assert.ok(!JSON.stringify(res.body).includes(token));
});
test('history routes require a session and database failures return a clear error',async()=>{
  const service={current:async()=>null};
  const router=createAccountRouter({service});
  const handler=router.stack.find(item=>item.route?.path==='/conversations').route.stack.at(-1).handle;
  const res={status(value){this.statusCode=value;return this},json(body){this.body=body;return this}};
  await handler({headers:{}},res);assert.equal(res.statusCode,401);
  const failing=createAccountRouter({service:{current:async()=>{throw new Error('private database connection info')}}});
  const get=failing.stack.find(item=>item.route?.path==='/auth/session').route.stack.at(-1).handle;
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
