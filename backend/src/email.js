import nodemailer from 'nodemailer';
import {isIP} from 'node:net';

const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const failure=(code,message)=>Object.assign(new Error(message),{status:503,code});
const clean=value=>String(value||'').replace(/[\r\n\x00-\x1f]/g,' ').slice(0,256);

export function requestMetadata(req){
  // Express only honors forwarded IPs when the operator explicitly trusts a proxy.
  const raw=clean(req.ip||req.socket?.remoteAddress);
  const ip=raw.startsWith('::ffff:')?raw.slice(7):raw;
  return {ip:isIP(ip)?ip:'unknown',device:clean(req.get?.('User-Agent')||req.headers?.['user-agent'])||'unknown'};
}

export function isPublicIP(ip){
  if(isIP(ip)===4){
    const [a,b]=ip.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&[0,168].includes(b))||(a===100&&b>=64&&b<=127)||(a===198&&[18,19,51].includes(b))||(a===203&&b===0));
  }
  return isIP(ip)===6&&!/^(::|fc|fd|fe[89ab]|2001:db8)/i.test(ip);
}

export async function lookupLocation(ip,{env=process.env,fetchImpl=globalThis.fetch}={}){
  if(!isPublicIP(ip))return {kind:ip==='unknown'?'unknown':'local',label:''};
  if(!env.IPINFO_TOKEN)return {kind:'unknown',label:''};
  try {
    const plan=env.IPINFO_PLAN==='lookup'?'lookup':'lite';
    const response=await fetchImpl('https://api.ipinfo.io/'+plan+'/'+encodeURIComponent(ip),{
      headers:{Authorization:'Bearer '+env.IPINFO_TOKEN},signal:AbortSignal.timeout(2500),redirect:'error'
    });
    if(!response.ok)return {kind:'unknown',label:''};
    const data=await response.json(),geo=data.geo||data;
    const parts=[geo.city,geo.region,geo.country||geo.country_code].filter(value=>typeof value==='string'&&value.trim());
    return {kind:parts.length?'approximate':'unknown',label:clean([...new Set(parts)].join(', '))};
  }catch{return {kind:'unknown',label:''}}
}

function htmlMessage(title,text,code){
  return '<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#edf1eb;padding:24px;color:#20342c">'+
    '<main style="max-width:540px;margin:auto;background:#fafbf7;padding:28px;border-radius:16px"><h2>'+escape(title)+'</h2>'+
    (code?'<p style="font-size:32px;letter-spacing:8px;font-weight:700">'+escape(code)+'</p>':'')+
    '<p style="white-space:pre-line;line-height:1.6">'+escape(text)+'</p></main></body></html>';
}

export function createEmailService({env=process.env,transport,fetchImpl=globalThis.fetch}={}){
  let smtp=transport;
  function ensureConfigured(){
    if(smtp)return;
    if(!env.SMTP_HOST||!env.EMAIL_FROM)throw failure('EMAIL_NOT_CONFIGURED','Имейлът не е настроен. Добави SMTP настройките в backend/.env.');
    const port=Number(env.SMTP_PORT)||587;
    smtp=nodemailer.createTransport({host:env.SMTP_HOST,port,secure:port===465,
      requireTLS:!(env.NODE_ENV!=='production'&&env.SMTP_ALLOW_INSECURE==='true'&&['localhost','127.0.0.1','::1'].includes(env.SMTP_HOST)),
      ...(env.SMTP_USER?{auth:{user:env.SMTP_USER,pass:env.SMTP_PASS}}:{}),
      connectionTimeout:4000,greetingTimeout:4000,socketTimeout:6000,
      disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});
  }
  async function send(email,title,text,code){
    ensureConfigured();
    try {
      await smtp.sendMail({from:env.EMAIL_FROM||'test@energy.test',to:email,subject:title,
        text:(code?code+'\n\n':'')+text,html:htmlMessage(title,text,code)});
    }catch{throw failure('EMAIL_UNAVAILABLE','Имейлът не беше изпратен. Опитай отново след малко.')}
  }
  return {
    ensureConfigured,
    async sendCode({email,name,language='bg',purpose,code}){
      const en=language==='en',reset=purpose==='RESET_PASSWORD';
      const title=en?(reset?'Reset your password — Energy Bulgaria':purpose==='SIGNUP'?'Confirm your account — Energy Bulgaria':'Confirm your login — Energy Bulgaria'):
        reset?'Възстановяване на парола — Енергия България':purpose==='SIGNUP'?'Потвърди профила си — Енергия България':'Потвърди входа — Енергия България';
      const text=en?`Hello ${name},\nEnter this code in the same browser where you requested it. It expires in 10 minutes. Never share it.\nIf you did not request this, ignore this email.`:
        `Здравей, ${name},\nВъведи кода в същия браузър, от който го поиска. Валиден е 10 минути. Не го споделяй.\nАко не си направил тази заявка, игнорирай имейла.`;
      await send(email,title,text,code);
    },
    async sendPasswordChanged({email,name,language='bg',changedAt,ip,device}){
      const location=await lookupLocation(ip,{env,fetchImpl}),en=language==='en';
      const where=location.kind==='local'?(en?'Local/private network':'Локална/частна мрежа'):
        location.kind==='approximate'?location.label:(en?'Unavailable':'Недостъпно');
      const title=en?'Your password was changed — Energy Bulgaria':'Паролата ти беше променена — Енергия България';
      const text=en?`Hello ${name},\nYour account password was changed.\nTime (UTC): ${changedAt}\nApproximate location: ${where}\nIP address: ${ip}\nDevice/browser: ${device}\nIP location is approximate and may reflect a VPN, not your actual location.\nIf this was not you, use “Forgot password?” immediately to recover your account. All previous sessions were signed out.`:
        `Здравей, ${name},\nПаролата на профила ти беше променена.\nВреме (UTC): ${changedAt}\nПриблизително местоположение: ${where}\nIP адрес: ${ip}\nУстройство/браузър: ${device}\nМестоположението по IP е приблизително и може да показва VPN, а не реалното ти място.\nАко не си ти, използвай „Забравена парола?“ веднага за възстановяване. Всички предишни сесии са прекратени.`;
      await send(email,title,text);
    }
  };
}
