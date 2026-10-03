import {useEffect,useRef,useState} from 'react';
import {History,Settings,PanelRight,X} from 'lucide-react';
import {useAppSettings} from './AppSettings.jsx';
import SettingsPanel,{AccountPanel} from './SettingsPanel.jsx';
import HistoryPanel from './HistoryPanel.jsx';
import {attachDrawerInteractions} from './drawerInteractions.js';

export default function ChatDrawer({open,onClose,triggerRef,history,currentId,onSelect,onNew,disabled}) {
  const {t}=useAppSettings(),[view,setView]=useState('history'),drawerRef=useRef(null),closeRef=useRef(null);
  useEffect(()=>{
    if(!open)return;
    const drawer=drawerRef.current,trigger=triggerRef.current;
    // Focusing the moving drawer must not scroll its clipped container.
    const frame=requestAnimationFrame(()=>closeRef.current?.focus({preventScroll:true}));
    const cleanup=attachDrawerInteractions({document,drawer,trigger,onClose});
    return ()=>{
      cancelAnimationFrame(frame);cleanup();
      if(trigger?.isConnected)trigger.focus({preventScroll:true});
    };
  },[open,onClose,triggerRef]);
  return <div className="chat-drawer-layer" data-open={open} aria-hidden={!open} inert={!open}>
    <div className="drawer-scrim" aria-hidden="true"/>
    <aside className="chat-drawer" id="chat-drawer" role="dialog" aria-labelledby="drawer-title" ref={drawerRef} tabIndex={-1}>
      <header className="drawer-header"><span className="drawer-heading"><PanelRight size={19}/><h2 id="drawer-title">{t('Меню на асистента')}</h2></span>
        <button className="close" ref={closeRef} aria-label={t('Затвори менюто')} onClick={onClose}><X size={19}/></button></header>
      <nav className="drawer-tabs" aria-label={t('Раздели на менюто')}>
        {[['history','История',History],['settings','Настройки',Settings]].map(([value,label,Icon])=><button type="button" key={value}
          aria-pressed={view===value} aria-controls="drawer-content" onClick={()=>setView(value)}><Icon size={16}/>{t(label)}</button>)}
      </nav>
      <div className="drawer-content" id="drawer-content">
        {view==='history'?<HistoryPanel history={history} currentId={currentId} onSelect={onSelect} onNew={onNew} disabled={disabled} onClose={onClose}/>:<SettingsPanel/>}
      </div>
      <AccountPanel/>
    </aside>
  </div>;
}
