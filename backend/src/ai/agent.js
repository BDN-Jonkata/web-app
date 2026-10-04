import {AIError} from './errors.js';

export const DEFAULT_AGENT_URL='http://127.0.0.1:8600';

// The team's own agent (BDN-Agent, `python -m sim.server`) behind the same contract as Groq.
// It answers from its documents and checks its claims; it does not change the simulation, so
// the patch is always empty. Each message is a paid run on the agent's side.
export function createAgentProvider({url=DEFAULT_AGENT_URL,fetchImpl=globalThis.fetch,timeoutMs=30000}={}) {
  const base=(url||DEFAULT_AGENT_URL).trim().replace(/\/+$/,'');
  return {
    status:()=>({provider:'agent',model:'bdn-agent',configured:true}),
    async generate({message},{signal}={}) {
      const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
      try {
        const response=await fetchImpl(base+'/chat',{
          method:'POST',signal:requestSignal,
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({message})
        });
        if(!response.ok)throw new AIError(502,'AI_PROVIDER_ERROR','Агентът не успя да отговори. Опитай отново.');
        const data=await response.json();
        if(typeof data?.reply!=='string'||!data.reply.trim()){
          throw new AIError(502,'AI_INVALID_RESPONSE','Агентът върна невалиден отговор. Опитай отново.');
        }
        const model=typeof data.path==='string'?'bdn-agent · '+data.path:'bdn-agent';
        return {reply:data.reply.trim().slice(0,6000),patch:{},provider:'agent',model};
      }catch(error){
        if(error instanceof AIError)throw error;
        if(requestSignal.aborted)throw new AIError(504,'AI_TIMEOUT','Агентът се забави твърде дълго. Опитай отново.');
        throw new AIError(502,'AI_UNAVAILABLE','Няма връзка с агента. Стартирай го с: python -m sim.server');
      }
    }
  };
}
