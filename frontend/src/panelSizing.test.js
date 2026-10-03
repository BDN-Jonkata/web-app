import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chatWidth,panelBounds,readChatWidth} from './panelSizing.js';

test('default widths keep the previous desktop proportions',()=>{
  assert.equal(chatWidth(null,1440),450);
  assert.equal(chatWidth(null,1000),370);
});
test('both panels retain usable minimum widths across desktop sizes',()=>{
  for(const width of [781,900,1200,1920]){
    const {min,max}=panelBounds(width);
    assert.equal(chatWidth(-100,width),min);
    assert.equal(chatWidth(9999,width),max);
    assert.ok(width-max-8>=400);
    assert.ok(min>=320);
  }
});
test('a stored preference adapts to smaller windows without changing the preference',()=>{
  const preferred=700;
  assert.equal(chatWidth(preferred,900),492);
  assert.equal(chatWidth(preferred,1600),700);
});
test('missing, corrupt or unavailable storage falls back safely',()=>{
  for(const value of [null,'','NaN','-20','Infinity'])assert.equal(readChatWidth({getItem:()=>value}),null);
  assert.equal(readChatWidth({getItem:()=>{throw Error('blocked')}}),null);
  assert.equal(readChatWidth({getItem:()=>'520'}),520);
});
test('divider supports pointer capture, keyboard access, reset and narrow-screen hiding',()=>{
  const component=readFileSync(new URL('./PanelDivider.jsx',import.meta.url),'utf8');
  for(const text of ['role="separator"','aria-orientation="vertical"','aria-valuenow','setPointerCapture','onPointerCancel','onLostPointerCapture','ArrowLeft','ArrowRight','Home','End','onDoubleClick'])assert.ok(component.includes(text),text);
  const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
  assert.match(css,/@media \(max-width:780px\)[\s\S]*?\.panel-divider \{ display: none; \}/);
});
