import {useEffect,useRef,useState} from 'react';
import {chatWidth,DIVIDER_WIDTH,panelBounds,readChatWidth,WIDTH_KEY} from './panelSizing.js';

export function usePanelWidth(container){
  const [preferred,setPreferred]=useState(()=>{
    try { return readChatWidth(globalThis.localStorage); } catch { return null; }
  });
  const [width,setWidth]=useState(()=>globalThis.innerWidth||1180);
  useEffect(()=>{
    const element=container.current;
    const observer=new ResizeObserver(()=>setWidth(element.getBoundingClientRect().width));
    setWidth(element.getBoundingClientRect().width);
    observer.observe(element);
    return ()=>observer.disconnect();
  },[container]);
  const save=value=>{
    setPreferred(value);
    try {
      if(value===null)localStorage.removeItem(WIDTH_KEY);
      else localStorage.setItem(WIDTH_KEY,String(value));
    } catch { /* Resizing still works when storage is unavailable. */ }
  };
  return {width,value:chatWidth(preferred,width),setPreferred,save};
}

export default function PanelDivider({container,sizing,t}){
  const drag=useRef(null);
  const [active,setActive]=useState(false);
  const {min,max}=panelBounds(sizing.width);
  const finish=event=>{
    if(!drag.current||drag.current.id!==event.pointerId)return;
    sizing.save(drag.current.value);
    drag.current=null;
    setActive(false);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className={'panel-divider'+(active?' dragging':'')} role="separator" tabIndex={0}
    aria-orientation="vertical" aria-controls="energy-dashboard energy-chat" aria-label={t('Промени ширината на картата и чата')}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={sizing.value}
    aria-valuetext={sizing.value+' px'} title={t('Плъзни за ширина · двойно щракване за нулиране')}
    onDoubleClick={()=>sizing.save(null)}
    onPointerDown={event=>{
      if(event.button!==0)return;
      event.preventDefault();
      event.currentTarget.focus();
      const rect=container.current.getBoundingClientRect();
      drag.current={id:event.pointerId,offset:rect.right-event.clientX-DIVIDER_WIDTH/2-sizing.value,value:sizing.value};
      event.currentTarget.setPointerCapture(event.pointerId);
      setActive(true);
    }}
    onPointerMove={event=>{
      if(drag.current?.id!==event.pointerId)return;
      const rect=container.current.getBoundingClientRect();
      const value=chatWidth(rect.right-event.clientX-DIVIDER_WIDTH/2-drag.current.offset,rect.width);
      drag.current.value=value;
      sizing.setPreferred(value);
    }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onKeyDown={event=>{
      let next;
      const step=event.shiftKey?50:20;
      if(event.key==='ArrowLeft')next=sizing.value+step;
      else if(event.key==='ArrowRight')next=sizing.value-step;
      else if(event.key==='Home')next=min;
      else if(event.key==='End')next=max;
      else if(event.key==='Enter'){event.preventDefault();sizing.save(null);return;}
      else return;
      event.preventDefault();
      sizing.save(chatWidth(next,sizing.width));
    }}><span aria-hidden="true"/></div>;
}
