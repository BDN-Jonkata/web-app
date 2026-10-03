import {sanitizePatch} from '../../../shared/chatContract.js';
import {AIError} from './errors.js';
import {buildEnergyContext,systemPromptForLanguage} from './context.js';

export const DEFAULT_MODEL='qwen/qwen3.8-27b';
const ENDPOINT='https://api.groq.com/openai/v1/chat/completions';

export function createGroqProvider({apiKey='',model=DEFAULT_MODEL,fetchImpl=globalThis.fetch,timeoutMs=25000}={}) {
  const key=apiKey.trim();
  return {
    status:()=>({provider:'groq',model,configured:Boolean(key)}),
    async generate({message,history,state,language='bg'},{signal}={}) {
      if(!key)throw new AIError(503,'AI_NOT_CONFIGURED','AI още не е настроен. Добави GROQ_API_KEY в web-app/backend/.env и рестартирай backend-а.');
      const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
      try {
        const response=await fetchImpl(ENDPOINT,{
          method:'POST',signal:requestSignal,
          headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
          body:JSON.stringify({
            model,temperature:.3,max_completion_tokens:900,response_format:{type:'json_object'},
            ...(model===DEFAULT_MODEL?{reasoning_effort:'none'}:{}),
            messages:[
              {role:'system',content:systemPromptForLanguage(language)+'\nSIMULATION_CONTEXT:\n'+JSON.stringify(buildEnergyContext(state))},
              ...history,{role:'user',content:message}
            ]
          })
        });
        if(response.status===429){
          const value=Number(response.headers.get('retry-after'));
          const retryAfter=Number.isFinite(value)&&value>0?Math.min(3600,Math.ceil(value)):60;
          throw new AIError(429,'AI_RATE_LIMIT','Достигнат е лимитът на безплатния AI. Опитай след '+retryAfter+' секунди.',retryAfter);
        }
        if(response.status===401||response.status===403){
          throw new AIError(502,'AI_AUTH_ERROR','Groq отхвърли API ключа или достъпа до модела. Провери GROQ_API_KEY и GROQ_MODEL в web-app/backend/.env.');
        }
        if(!response.ok)throw new AIError(502,'AI_PROVIDER_ERROR','AI доставчикът не успя да отговори. Опитай отново или провери модела в настройките на backend-а.');
        const data=await response.json();
        const content=data.choices?.[0]?.message?.content;
        if(typeof content!=='string'||data.choices?.[0]?.finish_reason==='length'){
          throw new AIError(502,'AI_INVALID_RESPONSE','AI върна непълен отговор. Опитай с по-кратък въпрос.');
        }
        let result;
        try { result=JSON.parse(content); }catch {
          throw new AIError(502,'AI_INVALID_RESPONSE','AI върна невалиден отговор. Опитай отново.');
        }
        if(!result||typeof result.reply!=='string'||!result.reply.trim()||result.reply.length>6000){
          throw new AIError(502,'AI_INVALID_RESPONSE','AI върна невалиден отговор. Опитай отново.');
        }
        return {reply:result.reply.trim(),patch:sanitizePatch(result.patch),provider:'groq',model};
      }catch(error){
        if(error instanceof AIError)throw error;
        if(requestSignal.aborted)throw new AIError(504,'AI_TIMEOUT','AI се забави твърде дълго. Опитай отново.');
        throw new AIError(502,'AI_UNAVAILABLE','Няма връзка с AI доставчика. Опитай отново след малко.');
      }
    }
  };
}
