import {createGroqProvider} from './groq.js';
import {AIError} from './errors.js';

// The frontend depends on this contract, not on Groq or an MCP transport.
// Future MCP adapter: status() + generate(request, {signal}) -> {reply,patch,provider,model}.
export function createAIProvider({env=process.env,fetchImpl=globalThis.fetch}={}) {
  const name=(env.AI_PROVIDER||'groq').trim().toLowerCase();
  if(name==='groq')return createGroqProvider({apiKey:env.GROQ_API_KEY||'',model:env.GROQ_MODEL||undefined,fetchImpl});
  return {
    status:()=>({provider:name,model:null,configured:false}),
    async generate(){
      throw new AIError(503,name==='mcp'?'MCP_NOT_CONFIGURED':'AI_PROVIDER_UNKNOWN',
        name==='mcp'?'MCP адаптерът още не е свързан. За временно тестване използвай AI_PROVIDER=groq.':'Неподдържан AI доставчик. Използвай AI_PROVIDER=groq.');
    }
  };
}
