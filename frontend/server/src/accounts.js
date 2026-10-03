import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {normalizePreferences,THEMES,LANGUAGES} from '../../shared/preferences.js';
import {normalizeState} from '../../shared/chatContract.js';
import {getDatabase} from '../../../backend/prisma/database.js';
const scrypt=promisify(scryptCallback),cost={N:2**17,r:8,p:1,maxmem:256*1024*1024};
export const SESSION_COOKIE='energy_session',SESSION_MS=7*24*60*60*1000;
export const accountError=(status,code,message)=>Object.assign(new Error(message),{status,code});
export const tokenHash=token=>createHash('sha256').update(token).digest('hex');
const publicUser=user=>({id:user.id,email:user.email,name:user.name,preferences:normalizePreferences(user.preferences)});
let activePasswordJobs=0;
async function passwordKey(password,salt){
  // Each scrypt job is memory-intensive; do not build an unbounded work queue.
  if(activePasswordJobs>=2)throw accountError(503,'AUTH_BUSY','Входът е временно натоварен. Опитай отново след малко.');
  activePasswordJobs++;
  try{return await scrypt(password,salt,64,cost)}finally{activePasswordJobs--}
}
export async function hashPassword(password) {
  const salt=randomBytes(16).toString('hex'),key=await passwordKey(password,salt);
  return 'scrypt$'+salt+'$'+key.toString('hex');
}
export async function verifyPassword(password,stored) {
  const [algorithm,salt,hex]=String(stored).split('$');
  if(algorithm!=='scrypt'||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(hex))return false;
  return timingSafeEqual(await passwordKey(password,salt),Buffer.from(hex,'hex'));
}
export function readSessionToken(req) {
  const value=(req.headers?.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1);
  return value&&/^[A-Za-z0-9_-]{43}$/.test(value)?value:null;
}
export function validateCredentials(input,{register=false}={}) {
  const email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
  const password=typeof input?.password==='string'?input.password:'';
  const name=typeof input?.name==='string'?input.name.trim():'';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw accountError(400,'INVALID_EMAIL','Въведи валиден имейл.');
  if(password.length>128||password.length<(register?15:1))throw accountError(400,'INVALID_PASSWORD','Паролата трябва да е между 15 и 128 знака.');
  if(register&&(name.length<2||name.length>60))throw accountError(400,'INVALID_NAME','Името трябва да е между 2 и 60 знака.');
  return {email,password,name};
}
export function validateConversation(input) {
  if(!Array.isArray(input?.messages)||!input.messages.length||input.messages.length>80)throw accountError(400,'INVALID_HISTORY','Невалидна история на разговора.');
  let total=0;
  const messages=input.messages.map(message=>{
    if(!['user','assistant'].includes(message?.role)||typeof message.content!=='string'||!message.content.trim()||message.content.length>6000)throw accountError(400,'INVALID_HISTORY','Невалидно съобщение в историята.');
    total+=message.content.length;return {role:message.role==='user'?'USER':'ASSISTANT',content:message.content};
  });
  if(total>80000)throw accountError(400,'HISTORY_TOO_LARGE','Разговорът е твърде дълъг за запазване.');
  let state;
  try{state=normalizeState(input.state)}catch{throw accountError(400,'INVALID_HISTORY','Невалиден сценарий в историята.')}
  return {messages,title:messages.find(message=>message.role==='USER')?.content.slice(0,80)||'Разговор',state};
}
export function createAccountService({database=getDatabase,now=()=>new Date()}={}) {
  async function issueSession(db,user){
    const token=randomBytes(32).toString('base64url');
    await db.session.create({data:{tokenHash:tokenHash(token),userId:user.id,expiresAt:new Date(now().getTime()+SESSION_MS)}});
    return {user:publicUser(user),token};
  }
  return {
    async register(input) {
      const {email,password,name}=validateCredentials(input,{register:true}),db=database(),passwordHash=await hashPassword(password);
      try {return await issueSession(db,await db.user.create({data:{email,name,passwordHash,preferences:normalizePreferences(input.preferences)}}))}
      catch(error){if(error.code==='P2002')throw accountError(409,'REGISTRATION_FAILED','Неуспешна регистрация. Опитай с друг имейл.');throw error}
    },
    async login(input) {
      const {email,password}=validateCredentials(input),db=database(),user=await db.user.findUnique({where:{email}});
      const valid=user?await verifyPassword(password,user.passwordHash):(await hashPassword(password),false);
      if(!valid)throw accountError(401,'INVALID_CREDENTIALS','Невалиден имейл или парола.');
      return issueSession(db,user);
    },
    async current(token) {
      if(!token)return null;
      const session=await database().session.findUnique({where:{tokenHash:tokenHash(token)},include:{user:true}});
      return session&&session.expiresAt>now()?publicUser(session.user):null;
    },
    async logout(token) {if(token)await database().session.deleteMany({where:{tokenHash:tokenHash(token)}})},
    async preferences(userId,input) {
      if(!THEMES.includes(input?.theme)||!LANGUAGES.includes(input?.language))throw accountError(400,'INVALID_PREFERENCES','Невалидни настройки.');
      return publicUser(await database().user.update({where:{id:userId},data:{preferences:normalizePreferences(input)}}));
    },
    async list(userId) {
      return database().conversation.findMany({where:{userId},orderBy:{updatedAt:'desc'},take:50,
        select:{id:true,title:true,updatedAt:true,_count:{select:{messages:true}}}});
    },
    async load(userId,id) {
      const conversation=await database().conversation.findFirst({where:{id,userId},include:{messages:{orderBy:{createdAt:'asc'}}}});
      if(!conversation)throw accountError(404,'HISTORY_NOT_FOUND','Разговорът не е намерен.');
      return {id:conversation.id,title:conversation.title,updatedAt:conversation.updatedAt,state:conversation.state,
        messages:conversation.messages.filter(message=>message.role!=='SYSTEM').map(message=>({role:message.role==='USER'?'user':'assistant',content:message.content}))};
    },
    async save(userId,id,input) {
      if(!/^[A-Za-z0-9_-]{16,80}$/.test(id))throw accountError(400,'INVALID_HISTORY','Невалиден идентификатор на разговор.');
      const data=validateConversation(input);
      return database().$transaction(async db=>{
        const existing=await db.conversation.findUnique({where:{id},select:{userId:true}});
        if(existing&&existing.userId!==userId)throw accountError(404,'HISTORY_NOT_FOUND','Разговорът не е намерен.');
        // Stable ordering also when several messages share the same DB timestamp.
        const messages=data.messages.map((message,index)=>({...message,createdAt:new Date(now().getTime()+index)}));
        const record=existing?
          await db.conversation.update({where:{id},data:{title:data.title,state:data.state,messages:{deleteMany:{},create:messages}}}):
          await db.conversation.create({data:{id,userId,title:data.title,state:data.state,messages:{create:messages}}});
        return {id:record.id,title:record.title,updatedAt:record.updatedAt};
      });
    }
  };
}
