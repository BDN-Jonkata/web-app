import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {attachDrawerInteractions} from './drawerInteractions.js';

function fixture(){
  const listeners=new Map();let closes=0,modal=false;
  const document={activeElement:null,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name)}};
  const control=visible=>({getClientRects:()=>visible?[{}]:[],focus(options){this.focusOptions=options;document.activeElement=this}});
  const first=control(true),hidden=control(false),last=control(true),trigger=control(true);
  trigger.contains=target=>target===trigger;
  const drawer={contains:target=>[drawer,first,hidden,last].includes(target),
    querySelector:()=>modal?{}:null,querySelectorAll:()=>[first,hidden,last],focus(){document.activeElement=this}};
  const cleanup=attachDrawerInteractions({document,drawer,trigger,onClose:()=>closes++});
  const key=(value,shiftKey=false)=>{
    const event={key:value,shiftKey,defaultPrevented:false,preventDefault(){this.defaultPrevented=true}};
    listeners.get('keydown')?.(event);return event;
  };
  return {document,drawer,first,last,trigger,key,cleanup,listeners,get closes(){return closes},set modal(value){modal=value}};
}
test('outside clicks close the drawer; drawer controls and its trigger do not',()=>{
  const view=fixture(),pointer=view.listeners.get('pointerdown');
  pointer({target:view.first});pointer({target:view.trigger});assert.equal(view.closes,0);
  pointer({target:{}});assert.equal(view.closes,1);view.cleanup();
});
test('Escape closes the drawer without sending Escape to another handler',()=>{
  const view=fixture();assert.equal(view.key('Escape').defaultPrevented,true);
  assert.equal(view.closes,1);view.cleanup();
});
test('Tab and Shift+Tab wrap around visible drawer controls',()=>{
  const view=fixture();view.last.focus();
  assert.equal(view.key('Tab').defaultPrevented,true);assert.equal(view.document.activeElement,view.first);
  assert.equal(view.first.focusOptions.preventScroll,true);
  assert.equal(view.key('Tab',true).defaultPrevented,true);assert.equal(view.document.activeElement,view.last);
  assert.equal(view.last.focusOptions.preventScroll,true);
  view.cleanup();
});
test('keyboard focus outside the open drawer returns to its controls',()=>{
  const view=fixture();view.trigger.focus();view.key('Tab');assert.equal(view.document.activeElement,view.first);
  view.trigger.focus();view.key('Tab',true);assert.equal(view.document.activeElement,view.last);view.cleanup();
});
test('the login dialog owns Escape and focus while it is open',()=>{
  const view=fixture();view.modal=true;view.last.focus();
  assert.equal(view.key('Escape').defaultPrevented,false);
  assert.equal(view.key('Tab').defaultPrevented,false);assert.equal(view.document.activeElement,view.last);
  view.listeners.get('pointerdown')({target:{}});assert.equal(view.closes,0);view.cleanup();
});
test('closing the drawer removes its global listeners',()=>{
  const view=fixture();view.cleanup();assert.equal(view.listeners.size,0);
});
test('the sidebar is an out-of-flow chat overlay, not a new layout column',()=>{
  const css=readFileSync(new URL('./appearance.css',import.meta.url),'utf8');
  const app=readFileSync(new URL('./App.jsx',import.meta.url),'utf8');
  const drawer=css.match(/\.chat-drawer\s*\{([^}]+)\}/)?.[1];
  assert.match(drawer,/position:absolute/);assert.match(drawer,/right:0/);assert.match(drawer,/translateX\(100%\)/);
  assert.match(css,/\.chat\s*\{\s*position:relative/);
  assert.doesNotMatch(css,/\.energy-app[^{}]*\{[^}]*grid-template-columns/);
  assert.equal((app.match(/className="header-icon drawer-trigger"/g)||[]).length,1);
  assert.ok(app.indexOf('<ChatDrawer ')<app.indexOf('export default function App()'));
  assert.doesNotMatch(app,/SettingsMenu|HistoryMenu/);
});
test('drawer motion uses one short smooth timing, without custom spring curves',()=>{
  const css=readFileSync(new URL('./appearance.css',import.meta.url),'utf8');
  const component=readFileSync(new URL('./ChatDrawer.jsx',import.meta.url),'utf8');
  assert.match(css,/--drawer-duration:200ms/);assert.match(css,/--drawer-easing:ease-in-out/);
  assert.match(css,/transition:transform var\(--drawer-duration\) var\(--drawer-easing\)/);
  assert.doesNotMatch(css,/cubic-bezier|@keyframes/);
  assert.match(component,/closeRef\.current\?\.focus\(\{preventScroll:true\}\)/);
});
