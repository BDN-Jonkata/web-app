import {createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {createAccountService,accountError,hashPassword,verifyPassword,tokenHash,publicUser,SESSION_MS,isValidEmail,isAcceptablePassword,PASSWORD_MESSAGE,pruneSessions} from './accounts.js';
import {getDatabase} from './database.js';
import {createEmailService} from './email.js';

export const CHALLENGE_COOKIE='energy_verification',CHALLENGE_MS=10*60*1000;
const cooldown=60000,maxAttempts=5;
const validToken=token=>typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token);
const codeHash=(token,code,purpose)=>createHmac('sha256',token).update(purpose+':'+code).digest('hex');
const invalid=()=>accountError(400,'INVALID_VERIFICATION','Кодът е невалиден, изтекъл или вече използван.');
const limited=()=>accountError(429,'EMAIL_RATE_LIMIT','Изчакай поне минута. Позволени са до 5 заявки на час за профил.');
const language=value=>value==='en'?'en':'bg';

export function readChallengeToken(req){
  const token=(req.headers?.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(CHALLENGE_COOKIE+'='))?.slice(CHALLENGE_COOKIE.length+1);
  return validToken(token)?token:null;
}

export function createEmailAuthService({database=getDatabase,now=()=>new Date(),mail=createEmailService(),credentials=createAccountService({database,now})}={}){
  async function transaction(fn){
    for(let retry=0;;retry++){
      try{return await database().$transaction(fn,{isolationLevel:'Serializable',timeout:15000})}
      catch(error){if(error.code!=='P2034'||retry>=2)throw error}
    }
  }
  async function start(user,purpose,lang,{deferDelivery=false}={}){
    mail.ensureConfigured();
    const token=randomBytes(32).toString('base64url'),code=String(randomInt(0,1000000)).padStart(6,'0'),time=now();
    const challenge=await transaction(async db=>{
      // Limits are per purpose, so repeated "forgot password" requests from a stranger cannot block the owner's login or signup.
      // The overall cap still protects the inbox from email bombing.
      const all=await db.authChallenge.findMany({where:{userId:user.id,createdAt:{gte:new Date(time.getTime()-3600000)}},orderBy:{lastSentAt:'desc'}});
      const recent=all.filter(item=>item.purpose===purpose);
      if(all.length>=10||recent.length>=5||recent.some(item=>time-item.lastSentAt<cooldown))throw limited();
      // Wrong guesses add up across challenges, so asking for fresh codes does not reset an attacker's guess budget.
      if(purpose==='RESET_PASSWORD'&&recent.reduce((sum,item)=>sum+item.attempts,0)>=10)throw limited();
      await db.authChallenge.updateMany({where:{userId:user.id,purpose,consumedAt:null},data:{consumedAt:time}});
      return db.authChallenge.create({data:{tokenHash:tokenHash(token),userId:user.id,purpose,email:user.email,
        codeHash:codeHash(token,code,purpose),credentialHash:user.passwordHash,language:lang,
        expiresAt:new Date(time.getTime()+CHALLENGE_MS),lastSentAt:time,createdAt:time}});
    });
    const deliver=async()=>{
      try{await mail.sendCode({email:user.email,name:user.name,language:lang,purpose,code})}
      catch(error){
        if(!deferDelivery)await database().authChallenge.updateMany({where:{tokenHash:challenge.tokenHash,consumedAt:null},data:{consumedAt:now()}});
        throw error;
      }
    };
    if(deferDelivery)void deliver().catch(()=>{/* Never log a verification code. */});
    else await deliver();
    return {verificationRequired:true,challengeToken:token,expiresAt:challenge.expiresAt,resendAt:new Date(time.getTime()+cooldown)};
  }
  // Looks like a real challenge but belongs to no account and sends nothing; verification always fails.
  async function decoy(purpose,lang){
    const token=randomBytes(32).toString('base64url'),time=now();
    const item=await database().authChallenge.create({data:{tokenHash:tokenHash(token),purpose,
      codeHash:codeHash(token,String(randomInt(0,1000000)).padStart(6,'0'),purpose),credentialHash:'',
      language:lang,expiresAt:new Date(time.getTime()+CHALLENGE_MS),lastSentAt:time,createdAt:time}});
    return {verificationRequired:true,challengeToken:token,expiresAt:item.expiresAt,resendAt:new Date(time.getTime()+cooldown)};
  }
  async function consume(token,code,purposes,complete){
    if(!validToken(token))throw invalid();
    const result=await transaction(async db=>{
      const time=now(),challenge=await db.authChallenge.findUnique({where:{tokenHash:tokenHash(token)},include:{user:true}});
      if(!challenge||challenge.consumedAt||challenge.expiresAt<=time||challenge.attempts>=maxAttempts||!purposes.includes(challenge.purpose))return {failure:invalid()};
      if(!challenge.userId){
        await db.authChallenge.updateMany({where:{tokenHash:challenge.tokenHash,consumedAt:null,attempts:{lt:maxAttempts}},data:{attempts:{increment:1}}});
        return {failure:invalid()};
      }
      const user=challenge.user;
      if(!user||!user.isActive||user.passwordHash!==challenge.credentialHash||user.email!==challenge.email)return {failure:invalid()};
      const correct=typeof code==='string'&&/^\d{6}$/.test(code)&&timingSafeEqual(Buffer.from(challenge.codeHash,'hex'),Buffer.from(codeHash(token,code,challenge.purpose),'hex'));
      if(!correct){
        // Return, don't throw: failed attempts must commit even for invalid codes.
        await db.authChallenge.updateMany({where:{tokenHash:challenge.tokenHash,consumedAt:null,attempts:{lt:maxAttempts}},data:{attempts:{increment:1}}});
        return {failure:invalid()};
      }
      const claimed=await db.authChallenge.updateMany({where:{tokenHash:challenge.tokenHash,consumedAt:null,attempts:{lt:maxAttempts},expiresAt:{gt:time}},data:{consumedAt:time}});
      if(claimed.count!==1)return {failure:invalid()};
      return {value:await complete(db,user,challenge,time)};
    });
    if(result.failure)throw result.failure;
    return result.value;
  }

  return {
    async register(input){
      mail.ensureConfigured();
      let user;
      try {
        const result=await credentials.register(input);
        user=await database().user.findUnique({where:{id:result.user.id}});
      }catch(error){
        if(error.code!=='REGISTRATION_FAILED')throw error;
        // A failed delivery can be retried, but never overwrite a pre-existing account.
        const existing=await database().user.findUnique({where:{email:String(input.email).trim().toLowerCase()}});
        // Anyone else gets the same 202 + cookie as a new signup, so registration cannot be used to find out which emails exist.
        if(!existing||!existing.isActive||existing.isEmailVerified||!await verifyPassword(input.password,existing.passwordHash))
          return decoy('SIGNUP',language(input?.preferences?.language));
        user=existing;
      }
      return start(user,'SIGNUP',language(input?.preferences?.language),{deferDelivery:true});
    },
    async login(input){
      mail.ensureConfigured();
      const result=await credentials.login(input);
      const user=await database().user.findUnique({where:{id:result.user.id}});
      return start(user,'LOGIN',language(input?.preferences?.language));
    },
    async verify({token,code,sessionToken}){
      return consume(token,code,['SIGNUP','LOGIN'],async(db,user,_challenge,time)=>{
        const verified=await db.user.update({where:{id:user.id},data:{isEmailVerified:true}});
        if(validToken(sessionToken))await db.session.deleteMany({where:{tokenHash:tokenHash(sessionToken)}});
        const issuedToken=randomBytes(32).toString('base64url');
        await db.session.create({data:{tokenHash:tokenHash(issuedToken),userId:user.id,expiresAt:new Date(time.getTime()+SESSION_MS)}});
        await pruneSessions(db,user.id);
        return {user:publicUser(verified),token:issuedToken};
      });
    },
    async resend(token){
      if(!validToken(token))throw invalid();
      mail.ensureConfigured();
      let code=String(randomInt(0,1000000)).padStart(6,'0');
      const challenge=await transaction(async db=>{
        const item=await db.authChallenge.findUnique({where:{tokenHash:tokenHash(token)},include:{user:true}}),time=now();
        if(!item||item.consumedAt||item.expiresAt<=time||item.attempts>=maxAttempts||(item.userId&&(!item.user?.isActive||item.user.passwordHash!==item.credentialHash||item.user.email!==item.email)))throw invalid();
        if(time-item.lastSentAt<cooldown||item.sendCount>=3)throw limited();
        while(codeHash(token,code,item.purpose)===item.codeHash)code=String(randomInt(0,1000000)).padStart(6,'0');
        await db.authChallenge.update({where:{tokenHash:item.tokenHash},data:{codeHash:codeHash(token,code,item.purpose),lastSentAt:time,sendCount:{increment:1}}});
        return {...item,lastSentAt:time};
      });
      if(challenge.user){
        const delivery=mail.sendCode({email:challenge.user.email,name:challenge.user.name,language:challenge.language,purpose:challenge.purpose,code});
        if(challenge.purpose==='RESET_PASSWORD')void delivery.catch(()=>{});
        else await delivery;
      }
      return {verificationRequired:true,expiresAt:challenge.expiresAt,resendAt:new Date(challenge.lastSentAt.getTime()+cooldown)};
    },
    async forgotPassword(input){
      mail.ensureConfigured();
      const email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
      if(!isValidEmail(email))throw accountError(400,'INVALID_EMAIL','Въведи валиден имейл.');
      const user=await database().user.findUnique({where:{email}});
      // Always return the same status/body/cookie shape; never disclose account existence.
      let result;
      if(user?.isActive){
        try{result=await start(user,'RESET_PASSWORD',language(input?.language),{deferDelivery:true})}
        catch(error){if(!['EMAIL_RATE_LIMIT','EMAIL_UNAVAILABLE'].includes(error.code))throw error}
      }
      // Persist a decoy too: resend behavior must not reveal whether the email exists.
      return result||decoy('RESET_PASSWORD',language(input?.language));
    },
    async resetPassword({token,code,password,confirmPassword,metadata={}}){
      if(!isAcceptablePassword(password))throw accountError(400,'INVALID_PASSWORD',PASSWORD_MESSAGE);
      if(password!==confirmPassword)throw accountError(400,'PASSWORD_MISMATCH','Паролите не съвпадат.');
      // Verify and update in one serializable transaction; replay/concurrent reset can't succeed twice.
      const result=await consume(token,code,['RESET_PASSWORD'],async(db,user,challenge,time)=>{
        await db.user.update({where:{id:user.id},data:{passwordHash:await hashPassword(password),isEmailVerified:true}});
        await db.session.deleteMany({where:{userId:user.id}});
        await db.authChallenge.updateMany({where:{userId:user.id,consumedAt:null},data:{consumedAt:time}});
        const job=await db.emailNotification.create({data:{payload:{email:user.email,name:user.name,language:challenge.language,
          changedAt:time.toISOString(),ip:metadata.ip||'unknown',device:metadata.device||'unknown'},nextAttempt:time}});
        return {notificationId:job.id};
      });
      const notificationSent=await deliverNotification(result.notificationId).catch(()=>false);
      return {ok:true,notificationPending:!notificationSent};
    },
    async deliverPendingNotifications(){
      const time=now(),db=database();
      const jobs=await db.emailNotification.findMany({where:{sentAt:null,nextAttempt:{lte:time}},orderBy:{createdAt:'asc'},take:10});
      for(const job of jobs)await deliverNotification(job.id);
      // Retain only recent security records; don't keep old IP/device data indefinitely.
      await db.authChallenge.deleteMany({where:{createdAt:{lt:new Date(time.getTime()-7*86400000)}}});
      await db.emailNotification.deleteMany({where:{sentAt:{lt:new Date(time.getTime()-7*86400000)}}});
      // Expired sessions and signups that never confirmed their email do not need to live forever.
      await db.session.deleteMany({where:{expiresAt:{lt:time}}});
      await db.user.deleteMany({where:{isEmailVerified:false,createdAt:{lt:new Date(time.getTime()-7*86400000)}}});
    }
  };

  async function deliverNotification(id){
    const db=database(),job=await db.emailNotification.findUnique({where:{id}});
    if(!job||job.sentAt)return true;
    // Claim a short delivery lease so multiple backend processes do not normally duplicate alerts.
    const claimed=await db.emailNotification.updateMany({where:{id,sentAt:null,nextAttempt:{lte:now()}},data:{attempts:{increment:1},nextAttempt:new Date(now().getTime()+120000)}});
    if(claimed.count!==1)return false;
    try {
      await mail.sendPasswordChanged(job.payload);
      await db.emailNotification.update({where:{id},data:{sentAt:now()}});
      return true;
    }catch{
      await db.emailNotification.update({where:{id},data:{nextAttempt:new Date(now().getTime()+Math.min(3600000,60000*2**Math.min(job.attempts,6)))}});
      return false;
    }
  }
}
