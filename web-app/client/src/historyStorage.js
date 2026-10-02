export const HISTORY_KEY='energy-bg:guest-history:v1';
export function normalizeRecord(input) {
  if(!input||typeof input.id!=='string'||!Array.isArray(input.messages))return null;
  const messages=input.messages.filter(message=>['user','assistant'].includes(message?.role)&&typeof message.content==='string')
    .slice(-80).map(message=>({role:message.role,content:message.content.slice(0,6000)}));
  if(!messages.length)return null;
  return {id:input.id,title:typeof input.title==='string'?input.title.slice(0,80):messages[0].content.slice(0,80),
    updatedAt:typeof input.updatedAt==='string'?input.updatedAt:new Date().toISOString(),messages,state:input.state};
}
export function readGuestHistory(storage) {
  try {const raw=JSON.parse(storage.getItem(HISTORY_KEY)||'[]');return Array.isArray(raw)?raw.map(normalizeRecord).filter(Boolean).slice(0,50):[]}
  catch{return []}
}
export function saveGuestHistory(storage,record) {
  const clean=normalizeRecord(record);
  if(!clean)throw new Error('Invalid conversation');
  const history=[clean,...readGuestHistory(storage).filter(item=>item.id!==clean.id)].slice(0,50);
  storage.setItem(HISTORY_KEY,JSON.stringify(history));
  return history;
}
