import {sanitizePatch} from '../../shared/chatContract.js';

export async function requestChat(payload,{signal,fetchImpl=globalThis.fetch}={}) {
  const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(35000)]):AbortSignal.timeout(35000);
  let response;
  try {
    response=await fetchImpl('/api/chat',{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'energy-web-app'},
      body:JSON.stringify(payload),signal:requestSignal
    });
  }catch(error){
    if(signal?.aborted)throw error;
    throw new Error(requestSignal.aborted?'Заявката към AI се забави. Опитай отново.':'Няма връзка с backend-а. Провери дали npm run dev е пуснат.');
  }
  let data;
  try { data=await response.json(); }catch {
    throw new Error('Backend-ът върна невалиден отговор. Провери дали Express API работи.');
  }
  if(!response.ok){
    const error=new Error(typeof data.error==='string'?data.error:'AI не успя да отговори. Опитай отново.');
    error.code=data.code;
    throw error;
  }
  if(typeof data.reply!=='string'||!data.reply.trim())throw new Error('AI върна празен отговор. Опитай отново.');
  return {...data,patch:sanitizePatch(data.patch)};
}
