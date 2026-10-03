import {useState} from 'react';
import {Plus,Check,MessageSquare} from 'lucide-react';
import {useAppSettings} from './AppSettings.jsx';

export default function HistoryPanel({history,currentId,onSelect,onNew,disabled,onClose}) {
  const {t,language,user,errorText}=useAppSettings(),[loading,setLoading]=useState(false),[error,setError]=useState(null);
  async function select(id){
    if(disabled||loading)return;
    setLoading(true);setError(null);
    try{await onSelect(id);onClose()}catch(error){setError(error)}finally{setLoading(false)}
  }
  return <section className="drawer-history" aria-label={t('История')}>
      <button className="new-conversation" disabled={disabled||loading} onClick={()=>{onNew();onClose()}}><Plus size={17}/>{t('Нов разговор')}</button>
      <div className="history-heading"><h3>{t('История')}</h3><small>{history.entries.length}</small></div>
      <p className="history-storage">{t(user?'Запазва се в профила':'Само в този браузър')}</p>
      {(history.loading||loading)&&<p className="settings-hint" role="status">{t('Зареждане…')}</p>}
      {(error||history.notice)&&<p className="ui-notice" role="status">{errorText(error||history.notice)}</p>}
      <div className="history-list">
        {!history.entries.length&&!history.loading&&<p className="history-empty">{t('Няма запазени разговори.')}</p>}
        {history.entries.map(entry=><button className={entry.id===currentId?'selected':''} key={entry.id} disabled={disabled||loading} onClick={()=>select(entry.id)}>
          <MessageSquare size={15}/><span><strong>{entry.title}</strong><small>{new Date(entry.updatedAt).toLocaleString(language==='en'?'en-GB':'bg-BG',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span>
          {entry.id===currentId&&<Check size={14}/>}
        </button>)}
      </div>
  </section>;
}
