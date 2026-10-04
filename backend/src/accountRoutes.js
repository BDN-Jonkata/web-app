import {Router} from 'express';
import {createAccountService,readSessionToken,accountError} from './accounts.js';
import {createChatLimiter} from './chat.js';
export function csrfGuard(req,res,next) {
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  if(req.get('Sec-Fetch-Site')==='cross-site')return res.status(403).json({code:'CSRF_REJECTED',error:'Заявката не е разрешена.'});
  const referer=req.get('Referer')||'';
  const isReference=referer.includes('/reference')||referer.includes('/scalar')||referer.includes('/docs');
  const authHeader=req.get('Authorization')||'';
  if(req.get('X-Requested-With')==='energy-web-app'||(isReference&&req.get('Sec-Fetch-Site')==='same-origin')||/^Bearer [A-Za-z0-9_-]{43}$/.test(authHeader)||(typeof req.path==='string'&&req.path.startsWith('/simulation')))return next();
  return res.status(403).json({code:'CSRF_REJECTED',error:'Заявката не е разрешена.'});
}
export function createAccountRouter({service=createAccountService()}={}) {
  const router=Router();
  const handle=fn=>async(req,res)=>{
    try {await fn(req,res)}catch(error){
      if(!error.status||!error.code){
        console.error('Unhandled database/API error:', error);
      }
      const safe=error.status&&error.code?error:accountError(503,'DATABASE_UNAVAILABLE','Базата данни за вход и история не е достъпна. Стартирай PostgreSQL и изпълни npm run db:migrate от web-app.');
      res.status(safe.status).json({code:safe.code,error:safe.message});
    }
  };
  const requireUser=async req=>{
    const user=await service.current(readSessionToken(req));
    if(!user)throw accountError(401,'LOGIN_REQUIRED','Влез в профила си.');
    return user;
  };
  // Session, logout and refresh-token live in services/auth.js (authController); only history and preferences are here.
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
