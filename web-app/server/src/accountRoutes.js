import {Router} from 'express';
import {createAccountService,readSessionToken,SESSION_COOKIE,SESSION_MS,accountError} from './accounts.js';
import {createChatLimiter} from './chat.js';
export function csrfGuard(req,res,next) {
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  if(req.get('X-Requested-With')!=='energy-web-app'||req.get('Sec-Fetch-Site')==='cross-site')return res.status(403).json({code:'CSRF_REJECTED',error:'Заявката не е разрешена.'});
  next();
}
export function createAccountRouter({service=createAccountService(),secure=process.env.NODE_ENV==='production'}={}) {
  const router=Router(),cookieOptions={httpOnly:true,secure,sameSite:'strict',path:'/api',maxAge:SESSION_MS};
  const handle=fn=>async(req,res)=>{
    try {await fn(req,res)}catch(error){
      const safe=error.status&&error.code?error:accountError(503,'DATABASE_UNAVAILABLE','Базата данни за вход и история не е достъпна. Стартирай PostgreSQL и изпълни npm run db:migrate от web-app.');
      res.status(safe.status).json({code:safe.code,error:safe.message});
    }
  };
  const requireUser=async req=>{
    const user=await service.current(readSessionToken(req));
    if(!user)throw accountError(401,'LOGIN_REQUIRED','Влез в профила си.');
    return user;
  };
  router.get('/auth/session',handle(async(req,res)=>res.json({user:await service.current(readSessionToken(req))})));
  for(const action of ['register','login'])router.post('/auth/'+action,createChatLimiter({limit:5}),handle(async(req,res)=>{
    const result=await service[action](req.body);
    await service.logout(readSessionToken(req));
    res.cookie(SESSION_COOKIE,result.token,cookieOptions).status(action==='register'?201:200).json({user:result.user});
  }));
  router.post('/auth/logout',handle(async(req,res)=>{
    await service.logout(readSessionToken(req));
    res.clearCookie(SESSION_COOKIE,{httpOnly:true,secure,sameSite:'strict',path:'/api'}).json({user:null});
  }));
  router.put('/auth/preferences',handle(async(req,res)=>{
    const user=await requireUser(req);res.json({user:await service.preferences(user.id,req.body)});
  }));
  router.get('/conversations',handle(async(req,res)=>{
    const user=await requireUser(req);res.json({conversations:await service.list(user.id)});
  }));
  router.get('/conversations/:id',handle(async(req,res)=>{
    const user=await requireUser(req);res.json({conversation:await service.load(user.id,req.params.id)});
  }));
  router.put('/conversations/:id',createChatLimiter({limit:30}),handle(async(req,res)=>{
    const user=await requireUser(req);res.json({conversation:await service.save(user.id,req.params.id,req.body)});
  }));
  return router;
}
