export function attachDrawerInteractions({document,drawer,trigger,onClose}) {
  const modalOpen=()=>Boolean(drawer.querySelector('dialog[open]'));
  const pointer=event=>{
    if(!modalOpen()&&!drawer.contains(event.target)&&!trigger?.contains(event.target))onClose();
  };
  const key=event=>{
    // The native login dialog owns its own Escape handling and focus trap.
    if(event.defaultPrevented||modalOpen())return;
    if(event.key==='Escape'){event.preventDefault();onClose();return}
    if(event.key!=='Tab')return;
    const controls=[...drawer.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')]
      .filter(element=>element.getClientRects().length);
    const first=controls[0],last=controls.at(-1),active=document.activeElement;
    if(!first){event.preventDefault();drawer.focus({preventScroll:true});return}
    if(event.shiftKey&&(active===first||!drawer.contains(active))){event.preventDefault();last.focus({preventScroll:true})}
    else if(!event.shiftKey&&(active===last||!drawer.contains(active))){event.preventDefault();first.focus({preventScroll:true})}
  };
  document.addEventListener('pointerdown',pointer);
  document.addEventListener('keydown',key);
  return ()=>{
    document.removeEventListener('pointerdown',pointer);
    document.removeEventListener('keydown',key);
  };
}
