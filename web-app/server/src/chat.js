import {normalizeChatRequest,sanitizePatch} from '../../shared/chatContract.js';
import {AIError} from './ai/errors.js';

export function createChatHandler(provider) {
  return async (req,res)=>{
    let input;
    try { input=normalizeChatRequest(req.body); }catch(error){
      return res.status(400).json({code:'INVALID_REQUEST',error:error.message});
    }
    const controller=new AbortController();
    const abort=()=>controller.abort();
    const close=()=>{if(!res.writableEnded)abort()};
    req.once('aborted',abort);
    res.once('close',close);
    try {
      const result=await provider.generate(input,{signal:controller.signal});
      if(controller.signal.aborted)return;
      if(typeof result?.reply!=='string'||!result.reply.trim()||result.reply.length>6000){
        throw new AIError(502,'AI_INVALID_RESPONSE','AI върна невалиден отговор.');
      }
      return res.json({reply:result.reply.trim(),patch:sanitizePatch(result.patch),
        provider:provider.status().provider,model:typeof result.model==='string'?result.model:provider.status().model});
    }catch(error){
      if(controller.signal.aborted)return;
      const safe=error instanceof AIError?error:new AIError(502,'AI_UNAVAILABLE','AI услугата не е достъпна. Опитай отново.');
      if(safe.retryAfter)res.set('Retry-After',String(safe.retryAfter));
      return res.status(safe.status).json({code:safe.code,error:safe.message,retryAfter:safe.retryAfter});
    }finally{
      req.removeListener('aborted',abort);
      res.removeListener('close',close);
    }
  };
}

export function createChatLimiter({limit=10,windowMs=60000,now=Date.now}={}) {
  const windows=new Map();
  return (req,res,next)=>{
    const time=now(),key=req.ip||'local';
    for(const [ip,entry] of windows)if(time>=entry.reset)windows.delete(ip);
    const entry=windows.get(key)||{count:0,reset:time+windowMs};
    if(entry.count>=limit){
      const retryAfter=Math.max(1,Math.ceil((entry.reset-time)/1000));
      res.set('Retry-After',String(retryAfter));
      return res.status(429).json({code:'CHAT_RATE_LIMIT',error:'Твърде много заявки. Опитай след '+retryAfter+' секунди.',retryAfter});
    }
    entry.count++;
    windows.set(key,entry);
    next();
  };
}
