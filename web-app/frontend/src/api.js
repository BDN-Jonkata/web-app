export async function api(path,{body,method='GET',signal}={}) {
  let response;
  try {response=await fetch('/api'+path,{method,credentials:'same-origin',
    headers:{'Content-Type':'application/json','X-Requested-With':'energy-web-app'},
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
    signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});
  }catch {throw Object.assign(new Error('Няма връзка с backend-а. Провери дали npm run dev е пуснат.'),{code:'NETWORK_ERROR'})}
  let data;
  try {data=await response.json()}catch{throw Object.assign(new Error('Невалиден отговор от backend-а.'),{code:'NETWORK_ERROR'})}
  if(!response.ok){
    if(data.code==='LOGIN_REQUIRED')window.dispatchEvent(new Event('energy-session-expired'));
    throw Object.assign(new Error(data.error||'Невалидна заявка.'),{code:data.code,status:response.status});
  }
  return data;
}
