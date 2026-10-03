import {useCallback,useEffect,useRef,useState} from 'react';
import {createDictation,speechAvailability} from './speechRecognition.js';

export function useDictation({language,setDraft,maxLength,disabled}) {
  const controller=useRef(null);
  const [snapshot,setSnapshot]=useState({status:'idle',error:null});
  const availability=speechAvailability(window);
  useEffect(()=>{
    const instance=createDictation({environment:window,onDraft:setDraft,onState:setSnapshot,maxLength});
    controller.current=instance;
    return ()=>{instance.dispose();controller.current=null};
  },[setDraft,maxLength]);
  const cancel=useCallback(()=>controller.current?.cancel(),[]);
  useEffect(()=>{
    // Stop capture when the composer is hidden, covered, busy, or changes
    // language. Late events must not replace a new conversation's draft.
    cancel();setSnapshot({status:'idle',error:null});
  },[language,disabled,cancel]);
  const start=useCallback(draft=>!disabled&&controller.current?.start({draft,language}),[disabled,language]);
  const stop=useCallback(()=>controller.current?.stop(),[]);
  const isActive=useCallback(()=>Boolean(controller.current?.active),[]);
  return {...snapshot,availability,active:snapshot.status!=='idle',start,stop,cancel,isActive};
}
