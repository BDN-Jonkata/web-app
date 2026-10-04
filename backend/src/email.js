import nodemailer from 'nodemailer';
import {isIP} from 'node:net';
import {renderCodeEmail,renderPasswordChangedEmail} from './emailTemplates.js';

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
  async function send(email,{subject,text,html}){
    ensureConfigured();
    try {
      await smtp.sendMail({from:env.EMAIL_FROM||'test@energy.test',to:email,subject,text,html});
    }catch{throw failure('EMAIL_UNAVAILABLE','Имейлът не беше изпратен. Опитай отново след малко.')}
  }
  return {
    ensureConfigured,
    async sendCode({email,name,language='bg',purpose,code}){
      await send(email,renderCodeEmail({language,name,purpose,code}));
    },
    async sendPasswordChanged({email,name,language='bg',changedAt,ip,device}){
      const location=await lookupLocation(ip,{env,fetchImpl}),en=language==='en';
      const where=location.kind==='local'?(en?'Local/private network':'Локална/частна мрежа'):
        location.kind==='approximate'?location.label:(en?'Unavailable':'Недостъпно');
      await send(email,renderPasswordChangedEmail({language,name,changedAt,where,ip,device}));
    }
  };
}
