import {useEffect,useRef,useState} from 'react';
import {UserRound,X,Mail,ArrowLeft} from 'lucide-react';
import {useAppSettings} from './AppSettings.jsx';
import {api} from './api.js';
import {challengeTiming} from './authFlow.js';

export default function AuthDialog({onClose}){
  const {t,language,authenticate,resetPassword,errorText}=useAppSettings(),ref=useRef(null);
  const [mode,setMode]=useState('login'),[challenge,setChallenge]=useState(null);
  const [pending,setPending]=useState(false),[error,setError]=useState(null),[notice,setNotice]=useState('');
  const [clock,setClock]=useState(Date.now());
  const timing=challengeTiming(challenge,clock),forgot=mode==='forgot',verifying=Boolean(challenge);
  useEffect(()=>{const dialog=ref.current;dialog.showModal();return ()=>dialog.close()},[]);
  useEffect(()=>{
    if(!challenge)return;
    const timer=setInterval(()=>setClock(Date.now()),1000);
    return ()=>clearInterval(timer);
  },[challenge]);
  useEffect(()=>{ref.current?.querySelector('form input:not(:disabled)')?.focus()},[mode,verifying]);
  function changeMode(value){setMode(value);setChallenge(null);setError(null);setNotice('')}
  async function submit(event){
    event.preventDefault();if(pending)return;
    const form=event.currentTarget,fields=new FormData(form);setError(null);setPending(true);
    try {
      if(verifying){
        if(forgot){
          const result=await resetPassword({code:fields.get('code'),password:fields.get('password'),confirmPassword:fields.get('confirmPassword')});
          form.reset();setChallenge(null);setMode('login');
          setNotice(result.notificationPending?'Паролата е променена. Известието по имейл ще бъде изпратено при възстановяване на връзката. Влез с новата парола.':'Паролата е променена. Изпратихме известие по имейл. Влез с новата парола.');
        }else{await authenticate('verify-code',{code:fields.get('code')});onClose()}
      }else{
        const result=forgot?await api('/auth/forgot-password',{method:'POST',body:{email:fields.get('email'),language}}):
          await authenticate(mode,{email:fields.get('email'),password:fields.get('password'),name:fields.get('name')});
        form.reset();setClock(Date.now());setChallenge(result);
      }
    }catch(error){setError(error)}finally{setPending(false)}
  }
  async function resend(){
    if(pending)return;
    setPending(true);setError(null);
    try {
      const result=await api('/auth/resend-code',{method:'POST',body:{}});
      setClock(Date.now());setChallenge(result);setNotice('Нов код е поискан. Провери входящата поща и папката „Спам“.');
      const input=ref.current?.querySelector('[name="code"]');if(input)input.value='';
    }catch(error){setError(error)}finally{setPending(false)}
  }
  const title=verifying?(forgot?'Нова парола':'Потвърди имейла си'):forgot?'Забравена парола?':mode==='login'?'Влез в профила си':'Създай профил';
  return <dialog className="auth-dialog" ref={ref} aria-labelledby="auth-title" onCancel={event=>{event.preventDefault();if(!pending)onClose()}}>
    <button className="dialog-close close" disabled={pending} aria-label={t('Затвори')} onClick={onClose}><X size={18}/></button>
    <div className="auth-icon">{verifying?<Mail size={23}/>:<UserRound size={23}/>}</div><h2 id="auth-title">{t(title)}</h2>
    <p className="auth-subtitle">{t(verifying?(forgot?'Ако има активен профил с този имейл, ще получиш код. Провери и „Спам“.':'Изпратихме код по имейл. Въведи го в този браузър.'):
      forgot?'Ще изпратим код за възстановяване на паролата.':'За запазване между устройства')}</p>
    {!verifying&&!forgot&&<div className="auth-tabs">{['login','register'].map(value=><button type="button" disabled={pending} aria-pressed={mode===value}
      className={mode===value?'active':''} key={value} onClick={()=>changeMode(value)}>{t(value==='login'?'Вход':'Регистрация')}</button>)}</div>}
    <form key={mode+':'+verifying} onSubmit={submit}>
      {!verifying&&mode==='register'&&<label>{t('Име')}<input name="name" autoComplete="name" minLength={2} maxLength={60} required disabled={pending}/></label>}
      {!verifying&&<label>{t('Имейл')}<input name="email" type="email" autoComplete="username" maxLength={254} required disabled={pending}/></label>}
      {verifying&&<label>{t('Код от имейла')}<input className="verification-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={pending||timing.expiresIn===0} aria-describedby="code-help"/>
        <small id="code-help">{t('Кодът е валиден 10 минути и има до 5 опита.')}</small></label>}
      {((!verifying&&!forgot)||(verifying&&forgot))&&<label>{t(verifying?'Нова парола':'Парола')}<input name="password" type="password"
        autoComplete={mode==='register'||forgot?'new-password':'current-password'} minLength={mode==='login'?1:6} maxLength={128} required disabled={pending}/>
        {mode!=='login'&&<small>{t('Поне 6 знака')}</small>}</label>}
      {verifying&&forgot&&<label>{t('Повтори новата парола')}<input name="confirmPassword" type="password" autoComplete="new-password" minLength={6} maxLength={128} required disabled={pending}/></label>}
      {notice&&<p className="auth-notice" role="status">{t(notice)}</p>}
      {error&&<p className="ui-notice" role="alert">{errorText(error)}</p>}
      {verifying&&timing.expiresIn===0&&<p className="ui-notice" role="status">{t('Кодът изтече. Върни се назад и поискай нов.')}</p>}
      <button className="primary-button" disabled={pending||(verifying&&timing.expiresIn===0)} type="submit">{t(pending?'Зареждане…':verifying?(forgot?'Промени паролата':'Потвърди'):forgot?'Изпрати код':mode==='register'?'Създай профил':'Вход')}</button>
    </form>
    {verifying&&<button className="auth-link" type="button" disabled={pending||timing.resendIn>0||timing.expiresIn===0} onClick={resend}>
      {t('Изпрати кода отново')}{timing.resendIn>0?' ('+timing.resendIn+' s)':''}
    </button>}
    {!verifying&&mode==='login'&&<button className="auth-link" type="button" disabled={pending} onClick={()=>changeMode('forgot')}>{t('Забравена парола?')}</button>}
    {(verifying||forgot)&&<button className="auth-link" type="button" disabled={pending} onClick={()=>changeMode(verifying?mode:'login')}><ArrowLeft size={14}/>{t('Назад')}</button>}
    <button className="guest-button" disabled={pending} onClick={onClose}>{t('Продължи като гост')}</button>
  </dialog>;
}
