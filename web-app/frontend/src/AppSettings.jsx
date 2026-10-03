import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {DEFAULT_PREFERENCES,normalizePreferences} from '../../shared/preferences.js';
import {translate,errorText} from './i18n.js';
import {api} from './api.js';

const Context=createContext(null),PREFS_KEY='energy-bg:preferences:v1';
function initialPreferences(){
  try {return normalizePreferences(JSON.parse(localStorage.getItem(PREFS_KEY)||'{}'))}catch{return {...DEFAULT_PREFERENCES}}
}
export function AppSettingsProvider({children}) {
  const [preferences,setPreferences]=useState(initialPreferences),[user,setUser]=useState(null),[sessionReady,setSessionReady]=useState(false);
  const [notice,setNotice]=useState(null),[systemDark,setSystemDark]=useState(()=>window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: dark)'),change=()=>setSystemDark(media.matches);
    media.addEventListener('change',change);return ()=>media.removeEventListener('change',change);
  },[]);
  useEffect(()=>{
    const expired=()=>{setUser(null);setNotice({code:'LOGIN_REQUIRED'});setSessionReady(true)};
    window.addEventListener('energy-session-expired',expired);
    return ()=>window.removeEventListener('energy-session-expired',expired);
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    api('/auth/session',{signal:controller.signal}).then(data=>{
      if(controller.signal.aborted)return;
      setUser(data.user);if(data.user)setPreferences(normalizePreferences(data.user.preferences));
    }).catch(error=>{if(!controller.signal.aborted)setNotice(error)})
      .finally(()=>{if(!controller.signal.aborted)setSessionReady(true)});
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{
    document.documentElement.dataset.theme=preferences.theme==='system'?(systemDark?'dark':'light'):preferences.theme;
    document.documentElement.lang=preferences.language;
    document.title=preferences.language==='en'?'Energy Bulgaria — interactive simulation':'Енергия България — интерактивна симулация';
    try{localStorage.setItem(PREFS_KEY,JSON.stringify(preferences))}catch{/* Preferences remain usable for this session. */}
  },[preferences,systemDark]);
  useEffect(()=>{
    if(!user)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      api('/auth/preferences',{method:'PUT',body:preferences,signal:controller.signal})
        .catch(error=>{if(!controller.signal.aborted)setNotice(error)});
    },400);
    return ()=>{clearTimeout(timer);controller.abort()};
  },[preferences,user?.id]);
  async function authenticate(action,credentials) {
    const data=await api('/auth/'+action,{method:'POST',body:{...credentials,preferences}});
    setUser(data.user);setPreferences(normalizePreferences(data.user.preferences));setNotice(null);setSessionReady(true);
  }
  async function logout(){
    await api('/auth/logout',{method:'POST',body:{}});
    setUser(null);setNotice(null);
  }
  const value=useMemo(()=>({preferences,user,sessionReady,notice,setNotice,
    language:preferences.language,t:key=>translate(preferences.language,key),
    errorText:error=>errorText(error,preferences.language),
    setPreference:(key,value)=>setPreferences(current=>normalizePreferences({...current,[key]:value})),
    authenticate,logout}),[preferences,user,sessionReady,notice]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useAppSettings=()=>useContext(Context);
