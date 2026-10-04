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

// IPv6 clients usually own a whole /64, so rate-limit on that prefix instead of the full address.
function limiterKey(ip){
  if(!ip)return 'local';
  const value=ip.startsWith('::ffff:')?ip.slice(7):ip;
  if(!value.includes(':'))return value;
  const [head]=value.split('%');
  const groups=head.includes('::')?(()=>{
    const [left,right]=head.split('::'),l=left?left.split(':'):[],r=right?right.split(':'):[];
    return [...l,...Array(Math.max(0,8-l.length-r.length)).fill('0'),...r];
  })():head.split(':');
  return groups.slice(0,4).map(group=>group.toLowerCase().replace(/^0+(?=.)/,'')).join(':')+'::/64';
}

// `shared` makes every client count against one bucket (used for the overall daily AI budget).
export function createChatLimiter({limit=10,windowMs=60000,now=Date.now,shared=false}={}) {
  const windows=new Map();
  let nextSweep=0;
  return (req,res,next)=>{
    const time=now(),key=shared?'all-clients':limiterKey(req.ip);
    // Sweep expired windows at most once per window, not on every request.
    if(time>=nextSweep){
      for(const [ip,entry] of windows)if(time>=entry.reset)windows.delete(ip);
      nextSweep=time+windowMs;
    }
    if(windows.get(key)&&time>=windows.get(key).reset)windows.delete(key);
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
