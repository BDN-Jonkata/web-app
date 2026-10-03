import test from 'node:test';
import assert from 'node:assert/strict';
import {createDictation,speechAvailability,SPEECH_ERRORS} from './speechRecognition.js';
import {translate} from './i18n.js';

function fixture({prefixed=false,maxLength=2000,startError,stopError}={}) {
  const instances=[],states=[],drafts=[];
  class Recognition {
    constructor(){instances.push(this);this.starts=0;this.stops=0;this.aborts=0}
    start(){this.starts++;if(startError)throw startError}
    stop(){this.stops++;if(stopError)throw stopError}
    abort(){this.aborts++}
    emit(type,event={}){this['on'+type]?.(event)}
    results(...entries){
      this.emit('result',{results:entries.map(entry=>{
        const result=[{transcript:typeof entry==='string'?entry:entry.text}];
        result.isFinal=typeof entry==='string'||entry.final;return result;
      })});
    }
  }
  const environment={isSecureContext:true,[prefixed?'webkitSpeechRecognition':'SpeechRecognition']:Recognition};
  const controller=createDictation({environment,onState:state=>states.push(state),onDraft:text=>drafts.push(text),maxLength});
  const start=options=>{controller.start(options);const recognition=instances.at(-1);recognition.emit('start');return recognition};
  return {controller,instances,states,drafts,environment,start,get draft(){return drafts.at(-1)}};
}

test('feature detection supports standard/prefixed APIs and rejects insecure/unsupported browsers',()=>{
  assert.equal(speechAvailability({SpeechRecognition:class {}}),'available');
  assert.equal(speechAvailability({webkitSpeechRecognition:class {}}),'available');
  assert.equal(speechAvailability({}),'unsupported');
  assert.equal(speechAvailability({isSecureContext:false,SpeechRecognition:class {}}),'insecure');
});
test('mounting never opens the microphone; starting requests the selected language',()=>{
  const view=fixture();assert.equal(view.instances.length,0);assert.equal(view.controller.active,false);
  const bg=view.start();assert.equal(bg.lang,'bg-BG');assert.equal(bg.continuous,true);assert.equal(bg.interimResults,true);
  assert.equal(bg.maxAlternatives,1);assert.equal(view.controller.snapshot.status,'listening');
  view.controller.cancel();const en=view.start({language:'en'});assert.equal(en.lang,'en-GB');view.controller.dispose();
});
test('prefixed recognition is usable and a second click cannot start another active session',()=>{
  const view=fixture({prefixed:true}),recognition=view.start();
  assert.equal(view.controller.start(),false);assert.equal(view.instances.length,1);assert.equal(recognition.starts,1);
  view.controller.dispose();
});
test('live interim hypotheses replace previous text without duplicating final results',()=>{
  const view=fixture(),recognition=view.start();
  recognition.results({text:'Колко',final:false});assert.equal(view.draft,'Колко');
  recognition.results({text:'Колко дава слънцето?',final:false});assert.equal(view.draft,'Колко дава слънцето?');
  recognition.results('Колко дава слънцето?');recognition.results('Колко дава слънцето?');
  assert.equal(view.draft,'Колко дава слънцето?');
  recognition.results('Колко дава слънцето?',{text:'През лятото.',final:false});
  assert.equal(view.draft,'Колко дава слънцето? През лятото.');view.controller.dispose();
});
test('shrinking or removed interim results do not leave obsolete words in the draft',()=>{
  const view=fixture(),recognition=view.start({draft:'Въпрос:'});
  recognition.results('София',{text:'много думи',final:false});
  recognition.results('София',{text:'днес',final:false});assert.equal(view.draft,'Въпрос: София днес');
  recognition.results('София');assert.equal(view.draft,'Въпрос: София');view.controller.dispose();
});
test('dictation preserves existing text, spaces and line breaks; a new session appends',()=>{
  const view=fixture();let recognition=view.start({draft:'Здравей!\n'});
  recognition.results('Покажи зимата.');assert.equal(view.draft,'Здравей!\nПокажи зимата.');
  recognition.emit('end');recognition=view.start({draft:view.draft});recognition.results('Вечер.');
  assert.equal(view.draft,'Здравей!\nПокажи зимата. Вечер.');view.controller.dispose();
});
test('stop waits for the final recognition result and never discards the draft',()=>{
  const view=fixture(),recognition=view.start();recognition.results({text:'Покажи зима',final:false});
  view.controller.stop();assert.equal(view.controller.snapshot.status,'stopping');assert.equal(recognition.stops,1);
  assert.equal(recognition.aborts,0);assert.equal(view.controller.active,true);
  view.controller.stop();assert.equal(recognition.stops,1);
  recognition.results('Покажи зима вечер.');recognition.emit('end');
  assert.equal(view.draft,'Покажи зима вечер.');assert.equal(view.controller.snapshot.status,'idle');
  assert.equal(view.controller.active,false);assert.equal(recognition.onresult,null);view.controller.dispose();
});
test('stopping while awaiting permission cancels and ignores late activation',()=>{
  const view=fixture();view.controller.start();const recognition=view.instances[0],lateStart=recognition.onstart;
  view.controller.stop();lateStart();assert.equal(recognition.aborts,1);assert.equal(recognition.stops,0);
  assert.equal(view.controller.active,false);assert.equal(view.controller.snapshot.status,'idle');view.controller.dispose();
});
test('normal end keeps visible text and never starts recognition again',()=>{
  const view=fixture(),recognition=view.start();recognition.results({text:'Видим текст',final:false});recognition.emit('end');
  assert.equal(view.draft,'Видим текст');assert.equal(view.controller.active,false);assert.equal(view.instances.length,1);
  assert.equal(view.controller.snapshot.error,null);view.controller.dispose();
});
test('cancel preserves text and ignores queued callbacks after switching conversations',()=>{
  const view=fixture(),old=view.start();old.results('Стар текст');const lateResult=old.onresult,lateError=old.onerror,lateEnd=old.onend;
  view.controller.cancel();const next=view.start({draft:'Нова чернова'}),count=view.drafts.length;
  lateResult({results:[[{transcript:'Закъснял текст'}]]});lateError({error:'network'});lateEnd();
  assert.equal(view.drafts.length,count);assert.equal(view.controller.snapshot.status,'listening');
  next.results('Нов текст');assert.equal(view.draft,'Нова чернова Нов текст');view.controller.dispose();
});
test('dispose aborts capture and suppresses all updates and restarts (including Strict Mode cleanup)',()=>{
  const view=fixture(),recognition=view.start(),result=recognition.onresult,end=recognition.onend;
  const count=view.states.length;view.controller.dispose();view.controller.dispose();
  result({results:[[{transcript:'Late'}]]});end();
  assert.equal(view.states.length,count);assert.equal(view.drafts.length,0);assert.equal(recognition.aborts,1);
  assert.equal(view.controller.start(),false);
  const fresh=fixture();fresh.start().results('Strict Mode remount');assert.equal(fresh.draft,'Strict Mode remount');fresh.controller.dispose();
});
test('message length is bounded and recognition stops at the limit',()=>{
  const view=fixture({maxLength:12}),recognition=view.start({draft:'Text'});
  recognition.results('Long dictated message');assert.equal(view.draft,'Text Long di');
  assert.equal(view.controller.snapshot.error,'limit');assert.equal(recognition.stops,1);
  recognition.results('Even longer final dictated message');assert.equal(view.draft.length,12);recognition.emit('end');
  assert.equal(view.controller.snapshot.error,'limit');view.controller.dispose();
});
test('a full draft cannot activate the microphone',()=>{
  const view=fixture({maxLength:4});assert.equal(view.controller.start({draft:'Full'}),false);
  assert.equal(view.instances.length,0);assert.equal(view.controller.snapshot.error,'limit');view.controller.dispose();
});
test('blocked microphone, missing device, network and language errors preserve text and allow retry',()=>{
  for(const [native,error] of [['not-allowed','permission'],['service-not-allowed','permission'],['audio-capture','microphone'],['network','network'],['language-not-supported','language'],['no-speech','silence'],['unexpected','failed']]){
    const view=fixture(),recognition=view.start();recognition.results('Запазен текст');recognition.emit('error',{error:native});
    assert.equal(view.controller.snapshot.error,error);assert.equal(view.controller.active,false);assert.equal(view.draft,'Запазен текст');
    assert.equal(recognition.aborts,1);view.start({draft:view.draft});assert.equal(view.controller.snapshot.error,null);view.controller.dispose();
  }
});
test('unsupported and insecure contexts fail safely without constructing recognition',()=>{
  for(const [environment,error] of [[{},'unsupported'],[{isSecureContext:false},'insecure']]){
    const controller=createDictation({environment,onDraft:()=>assert.fail('Unexpected text'),onState:()=>{}});
    assert.equal(controller.start(),false);assert.equal(controller.active,false);assert.equal(controller.snapshot.error,error);controller.dispose();
  }
});
test('constructor/start/stop exceptions cannot leave the composer locked',()=>{
  const controller=createDictation({environment:{SpeechRecognition:class {constructor(){throw new Error('Unavailable')}}},onState:()=>{},onDraft:()=>{}});
  assert.equal(controller.start(),false);assert.equal(controller.snapshot.error,'failed');controller.dispose();
  for(const name of ['NotAllowedError','InvalidStateError']){
    const view=fixture({startError:Object.assign(new Error('Start failed'),{name})});
    assert.equal(view.controller.start(),false);assert.equal(view.controller.active,false);
    assert.equal(view.controller.snapshot.error,name==='NotAllowedError'?'permission':'failed');view.controller.dispose();
  }
  const view=fixture({stopError:new Error('Already stopped')});const recognition=view.start();recognition.results('Preserved');
  view.controller.stop();assert.equal(view.controller.active,false);assert.equal(view.draft,'Preserved');assert.equal(recognition.aborts,1);view.controller.dispose();
});
test('silence is explained, but manually stopping an empty session is not an error',()=>{
  const view=fixture();view.start().emit('end');assert.equal(view.controller.snapshot.error,'silence');
  const recognition=view.start();view.controller.stop();recognition.emit('error',{error:'no-speech'});
  assert.equal(view.controller.snapshot.error,null);assert.equal(view.controller.active,false);view.controller.dispose();
});
test('a later matching result clears a temporary no-match notice',()=>{
  const view=fixture(),recognition=view.start();recognition.emit('nomatch');assert.equal(view.controller.snapshot.error,'silence');
  recognition.results('Разпознат текст');assert.equal(view.controller.snapshot.error,null);
  recognition.emit('end');assert.equal(view.controller.snapshot.error,null);view.controller.dispose();
});
test('a stalled stop times out safely while preserving the visible draft',context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const view=fixture(),recognition=view.start();recognition.results('Запазено');view.controller.stop();
  context.mock.timers.tick(5000);assert.equal(view.controller.active,false);assert.equal(view.draft,'Запазено');
  assert.equal(recognition.aborts,1);view.controller.dispose();context.mock.timers.reset();
});
test('all microphone controls and errors are translated into English and Bulgarian',()=>{
  for(const message of [...Object.values(SPEECH_ERRORS),'Диктувай на български','Диктувай на английски','Спри диктовката',
    'Разреши микрофона, ако браузърът поиска достъп…','Слушам… Спри диктовката, прегледай текста и го изпрати.',
    'Завършвам диктовката…','Гласът може да се обработва от външната услуга на браузъра.',
    'Диктовката не изпраща съобщението автоматично.']){
    assert.equal(translate('bg',message),message);assert.notEqual(translate('en',message),message);
  }
});
