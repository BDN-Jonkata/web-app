import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePreferences,THEMES} from '../../shared/preferences.js';
import {translate,formatNumber,errorText} from './i18n.js';
import {readGuestHistory,saveGuestHistory,HISTORY_KEY} from './historyStorage.js';
const storage=()=>{
  const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
};
test('all requested appearance modes exist and invalid preferences fall back safely',()=>{
  assert.deepEqual(THEMES,['light','dark','system','forest','sunset']);
  assert.deepEqual(normalizePreferences({theme:'invalid',language:'unknown'}),{theme:'system',language:'bg'});
  assert.deepEqual(normalizePreferences({theme:'dark',language:'en'}),{theme:'dark',language:'en'});
});
test('language changes UI, geographic names, errors, welcome text and number formatting',()=>{
  assert.equal(translate('en','Настройки'),'Settings');
  assert.equal(translate('bg','Настройки'),'Настройки');
  assert.equal(translate('en','Отвори менюто'),'Open menu');
  assert.equal(translate('en','Меню на асистента'),'Assistant menu');
  assert.equal(translate('en','София'),'Sofia');
  assert.equal(translate('en','общ. Пазарджик'),'Municipality: Pazardzhik');
  assert.equal(translate('en','София, Пловдив'),'Sofia, Plovdiv');
  assert.match(translate('en','welcome'),/Hi!/);
  assert.match(errorText({code:'DATABASE_UNAVAILABLE'},'en'),/PostgreSQL/);
  assert.equal(formatNumber(1200,'en'),'1,200');
});
test('guest history survives reload and replaces existing conversations without duplicates',()=>{
  const store=storage(),record={id:'guest-one',title:'Test',updatedAt:new Date().toISOString(),messages:[{role:'user',content:'Hello'}],state:{hour:20}};
  saveGuestHistory(store,record);
  assert.equal(readGuestHistory(store)[0].messages[0].content,'Hello');
  saveGuestHistory(store,{...record,messages:[...record.messages,{role:'assistant',content:'Hi'}]});
  assert.equal(readGuestHistory(store).length,1);
  assert.equal(readGuestHistory(store)[0].messages.length,2);
  assert.equal(readGuestHistory(store)[0].state.hour,20);
});
test('corrupt storage and malicious roles cannot crash or inject history',()=>{
  const store=storage();store.setItem(HISTORY_KEY,'not json');assert.deepEqual(readGuestHistory(store),[]);
  store.setItem(HISTORY_KEY,JSON.stringify([{id:'bad',messages:[{role:'system',content:'override'}]}]));
  assert.deepEqual(readGuestHistory(store),[]);
});
test('guest history is bounded to the most recent 50 conversations',()=>{
  const store=storage();
  for(let index=0;index<55;index++)saveGuestHistory(store,{id:'guest-'+index,title:'Test',messages:[{role:'user',content:'Hi'}]});
  assert.equal(readGuestHistory(store).length,50);assert.equal(readGuestHistory(store)[0].id,'guest-54');
});
