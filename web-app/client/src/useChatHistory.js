import {useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import {readGuestHistory,saveGuestHistory} from './historyStorage.js';

export function useChatHistory(userId) {
  const [entries,setEntries]=useState([]),[notice,setNotice]=useState(null),[loading,setLoading]=useState(false);
  const lifetime=useRef(null),cache=useRef(new Map()),queue=useRef(Promise.resolve());
  useEffect(()=>{
    const controller=new AbortController();lifetime.current=controller;
    if(!userId){
      try{setEntries(readGuestHistory(localStorage))}catch{setEntries([])}
      return ()=>controller.abort();
    }
    setLoading(true);
    api('/conversations',{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setEntries(data.conversations)})
      .catch(error=>{if(!controller.signal.aborted)setNotice(error)})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return ()=>controller.abort();
  },[userId]);
  function save(record) {
    cache.current.set(record.id,record);
    queue.current=queue.current.catch(()=>{}).then(async()=>{
      const signal=lifetime.current?.signal;
      if(!signal||signal.aborted)return;
      try {
        if(!userId)setEntries(saveGuestHistory(localStorage,record));
        else {
          const data=await api('/conversations/'+encodeURIComponent(record.id),{method:'PUT',body:record,signal});
          if(!signal.aborted)setEntries(previous=>[{...data.conversation,messageCount:record.messages.length},...previous.filter(item=>item.id!==record.id)].slice(0,50));
        }
        if(!signal.aborted)setNotice(null);
      }catch(error){
        if(!signal.aborted)setNotice(!userId?Object.assign(new Error('Storage unavailable'),{code:'STORAGE_UNAVAILABLE'}):error);
      }
    });
    return queue.current;
  }
  async function load(id) {
    if(cache.current.has(id))return cache.current.get(id);
    if(!userId)return entries.find(item=>item.id===id);
    const data=await api('/conversations/'+encodeURIComponent(id),{signal:lifetime.current?.signal});
    return data.conversation;
  }
  return {entries,notice,loading,save,load};
}
