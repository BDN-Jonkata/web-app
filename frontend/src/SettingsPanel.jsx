import {useRef,useState} from 'react';
import {Check,Sun,Moon,Monitor,Leaf,Sunset,LogIn,LogOut,UserRound,X,Globe} from 'lucide-react';
import {useAppSettings} from './AppSettings.jsx';
import AuthDialog from './AuthDialog.jsx';

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
