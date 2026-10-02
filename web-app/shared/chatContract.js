import {CITIES,SITES,NUCLEAR,SEASONS} from './energy.js';

export const MAX_MESSAGE_LENGTH=2000;
export const INITIAL_STATE={
  hour:13,season:'autumn',cloud:20,wind:45,playing:false,
  layers:{solar:true,wind:true,hydro:true,demand:true,flow:true},selected:'sofia'
};
const ids=new Set([...CITIES,...SITES,NUCLEAR].map(item=>item.id));
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

// LLM output is untrusted. Copy only known, valid control values, never spread it.
export function sanitizePatch(input) {
  if(!plain(input))return {};
  const patch={};
  for(const [key,max] of [['hour',23.75],['cloud',100],['wind',100]]){
    if(typeof input[key]==='number'&&Number.isFinite(input[key])&&input[key]>=0&&input[key]<=max){
      patch[key]=key==='hour'?Math.round(input[key]*4)/4:Math.round(input[key]/5)*5;
    }
  }
  if(typeof input.season==='string'&&own(SEASONS,input.season))patch.season=input.season;
  if(typeof input.playing==='boolean')patch.playing=input.playing;
  if(input.selected===null||input.selected==='none')patch.selected=null;
  else if(ids.has(input.selected))patch.selected=input.selected;
  if(plain(input.layers)){
    const layers={};
    for(const key of Object.keys(INITIAL_STATE.layers))if(typeof input.layers[key]==='boolean')layers[key]=input.layers[key];
    if(Object.keys(layers).length)patch.layers=layers;
  }
  return patch;
}

export function applySimulationPatch(state,input) {
  const patch=sanitizePatch(input);
  return {...state,...patch,layers:{...state.layers,...patch.layers}};
}

export function normalizeState(input) {
  if(input===undefined)return structuredClone(INITIAL_STATE);
  if(!plain(input))throw new TypeError('Невалидно състояние на симулацията.');
  const patch=sanitizePatch(input);
  for(const key of ['hour','season','cloud','wind','playing','selected']){
    if(own(input,key)&&!own(patch,key))throw new TypeError('Невалидна стойност за '+key+'.');
  }
  if(own(input,'layers')){
    if(!plain(input.layers))throw new TypeError('Невалидни слоеве на картата.');
    for(const key of Object.keys(INITIAL_STATE.layers)){
      if(own(input.layers,key)&&typeof input.layers[key]!=='boolean')throw new TypeError('Невалиден слой: '+key+'.');
    }
  }
  return applySimulationPatch(structuredClone(INITIAL_STATE),patch);
}

export function normalizeChatRequest(body) {
  if(!plain(body)||typeof body.message!=='string'||!body.message.trim())throw new TypeError('Въведи съобщение.');
  const message=body.message.trim();
  if(message.length>MAX_MESSAGE_LENGTH)throw new TypeError('Съобщението е твърде дълго (до '+MAX_MESSAGE_LENGTH+' знака).');
  if(body.history!==undefined&&!Array.isArray(body.history))throw new TypeError('Невалидна история на разговора.');
  const history=[];
  let remaining=4000;
  // Keep recent exchanges small enough for a free-tier API; never accept system roles.
  for(const item of (body.history||[]).slice(-8).reverse()){
    if(!plain(item)||!['user','assistant'].includes(item.role)||typeof item.content!=='string'){
      throw new TypeError('Невалидно съобщение в историята.');
    }
    const content=item.content.trim().slice(0,Math.min(1000,remaining));
    if(content)history.unshift({role:item.role,content});
    remaining-=content.length;
    if(remaining<=0)break;
  }
  if(body.language!==undefined&&!['bg','en'].includes(body.language))throw new TypeError('Невалиден език.');
  return {message,history,state:normalizeState(body.state),language:body.language||'bg'};
}
