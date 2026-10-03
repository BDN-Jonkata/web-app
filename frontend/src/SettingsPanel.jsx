import {useEffect,useRef,useState} from 'react';
import {Check,Sun,Moon,Monitor,Leaf,Sunset,LogIn,LogOut,UserRound,X,Globe} from 'lucide-react';
import {useAppSettings} from './AppSettings.jsx';

function AuthDialog({onClose}) {
  const {t,authenticate,errorText}=useAppSettings(),ref=useRef(null);
  const [mode,setMode]=useState('login'),[pending,setPending]=useState(false),[error,setError]=useState(null);
  useEffect(()=>{const dialog=ref.current;dialog.showModal();return ()=>dialog.close()},[]);
  async function submit(event){
    event.preventDefault();if(pending)return;
    const fields=new FormData(event.currentTarget);setError(null);setPending(true);
    try{await authenticate(mode,{email:fields.get('email'),password:fields.get('password'),name:fields.get('name')});onClose()}
    catch(error){setError(error)}finally{setPending(false)}
  }
  return <dialog className="auth-dialog" ref={ref} aria-labelledby="auth-title" onCancel={event=>{event.preventDefault();if(!pending)onClose()}}>
    <button className="dialog-close close" disabled={pending} aria-label={t('Затвори')} onClick={onClose}><X size={18}/></button>
    <div className="auth-icon"><UserRound size={23}/></div><h2 id="auth-title">{t(mode==='login'?'Влез в профила си':'Създай профил')}</h2>
    <p className="auth-subtitle">{t('За запазване между устройства')}</p>
    <div className="auth-tabs">{['login','register'].map(value=><button type="button" disabled={pending} aria-pressed={mode===value}
      className={mode===value?'active':''} key={value} onClick={()=>{setMode(value);setError(null)}}>{t(value==='login'?'Вход':'Регистрация')}</button>)}</div>
    <form onSubmit={submit}>
      {mode==='register'&&<label>{t('Име')}<input name="name" autoComplete="name" minLength={2} maxLength={60} required disabled={pending}/></label>}
      <label>{t('Имейл')}<input name="email" type="email" autoComplete="username" maxLength={254} autoFocus required disabled={pending}/></label>
      <label>{t('Парола')}<input name="password" type="password" autoComplete={mode==='register'?'new-password':'current-password'} minLength={mode==='register'?6:1}
        maxLength={30} required disabled={pending}/>{mode==='register'&&<small>{t('Поне 6 знака')}</small>}</label>
      {error&&<p className="ui-notice" role="alert">{errorText(error)}</p>}
      <button className="primary-button" disabled={pending} type="submit">{t(pending?'Зареждане…':mode==='register'?'Създай профил':'Вход')}</button>
    </form>
    <button className="guest-button" disabled={pending} onClick={onClose}>{t('Продължи като гост')}</button>
  </dialog>;
}

const modes=[['light','Бял режим',Sun],['dark','Тъмен режим',Moon],['system','Системен режим',Monitor]];
const bonuses=[['forest','Горски режим',Leaf],['sunset','Залез',Sunset]];
export default function SettingsPanel() {
  const {t,preferences,setPreference}=useAppSettings();
  function themeButton([value,label,Icon]){
    return <button type="button" className={'theme-option '+(preferences.theme===value?'selected':'')} aria-pressed={preferences.theme===value}
      key={value} onClick={()=>setPreference('theme',value)}><Icon size={16}/><span>{t(label)}</span>{preferences.theme===value&&<Check size={13}/>}</button>;
  }
  return <section className="drawer-settings" aria-label={t('Настройки')}>
      <div className="settings-section"><h3>{t('Тема')}</h3><div className="theme-options">{modes.map(themeButton)}</div>
        {preferences.theme==='system'&&<p className="settings-hint">{t('Следва настройката на устройството')}</p>}
        <div className="theme-options bonus-options">{bonuses.map(themeButton)}</div></div>
      <div className="settings-section"><h3><Globe size={14}/>{t('Език')}</h3><div className="language-options">
        {[['bg','Български'],['en','Английски']].map(([value,label])=><button type="button" className={preferences.language===value?'selected':''}
          aria-pressed={preferences.language===value} onClick={()=>setPreference('language',value)} key={value}>{t(label)}{preferences.language===value&&<Check size={13}/>}</button>)}
      </div></div>
  </section>;
}

export function AccountPanel() {
  const {t,user,logout,notice,setNotice,errorText,sessionReady}=useAppSettings();
  const [authOpen,setAuthOpen]=useState(false),[pending,setPending]=useState(false),trigger=useRef(null);
  async function signOut(){
    setPending(true);
    try{await logout()}catch(error){setNotice(error)}finally{setPending(false)}
  }
  return <div className="drawer-account">
    <div className="account-summary"><span className="account-avatar"><UserRound size={20}/></span>
      <div><strong>{user?user.name:t('Гост')}</strong><small>{user?user.email:t('Влез, за да запазваш разговорите в профила си.')}</small></div>
    </div>
    {user?<button className="account-action" disabled={pending} onClick={signOut}><LogOut size={15}/>{t(pending?'Зареждане…':'Изход')}</button>:
      <button className="account-action" ref={trigger} disabled={!sessionReady} onClick={()=>setAuthOpen(true)}><LogIn size={15}/>{t(sessionReady?'Вход':'Проверка на профила…')}</button>}
    {notice&&<p className="ui-notice" role="status">{errorText(notice)}</p>}
    {authOpen&&<AuthDialog onClose={()=>{setAuthOpen(false);requestAnimationFrame(()=>trigger.current?.focus())}}/>}
  </div>;
}
