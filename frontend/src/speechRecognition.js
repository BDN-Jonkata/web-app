export const SPEECH_ERRORS={
  unsupported:'Този браузър не поддържа диктовка. Опитай с Chrome.',
  insecure:'Микрофонът изисква HTTPS или localhost.',
  permission:'Разреши достъпа до микрофона от настройките на сайта и опитай отново.',
  microphone:'Не е намерен достъпен микрофон. Провери устройството и опитай отново.',
  network:'Няма връзка с услугата за диктовка. Провери интернет връзката.',
  language:'Услугата не поддържа избрания език за диктовка.',
  silence:'Не беше разпозната реч. Натисни микрофона и опитай отново.',
  limit:'Достигнат е лимитът на съобщението. Редактирай текста преди изпращане.',
  failed:'Диктовката не успя. Опитай отново или въведи текста ръчно.'
};

export function speechAvailability(environment=globalThis) {
  if(environment.isSecureContext===false)return 'insecure';
  return typeof (environment.SpeechRecognition||environment.webkitSpeechRecognition)==='function'?'available':'unsupported';
}

const errorCode=value=>({
  'not-allowed':'permission','service-not-allowed':'permission',
  'audio-capture':'microphone',network:'network',
  'language-not-supported':'language','no-speech':'silence'
})[value]||'failed';

// One explicitly started session at a time. No recording storage, automatic
// retries, or sending: the only output is text for the user's editable draft.
export function createDictation({environment=globalThis,onDraft,onState,maxLength=2000}) {
  let session=null,disposed=false,snapshot={status:'idle',error:null};
  const update=patch=>{
    snapshot={...snapshot,...patch};
    if(!disposed)onState(snapshot);
  };
  const detach=current=>{
    clearTimeout(current.timer);
    for(const event of ['start','result','error','end','nomatch'])current.recognition['on'+event]=null;
  };
  const abort=current=>{try{current.recognition.abort()}catch{/* Already ended. */}};
  const finish=(current,error=snapshot.error)=>{
    if(session!==current)return;
    detach(current);session=null;update({status:'idle',error});
  };
  function cancel() {
    if(!session)return;
    const current=session;
    finish(current);abort(current);
  }
  function stop() {
    if(!session||session.ending)return;
    const current=session;
    if(!current.started){cancel();return}
    current.ending=true;update({status:'stopping'});
    // stop() allows a final recognition result; abort() would discard it.
    // A stalled browser cannot keep the composer locked indefinitely.
    current.timer=setTimeout(()=>{finish(current);abort(current)},5000);
    try{current.recognition.stop()}catch{finish(current);abort(current)}
  }
  function start({draft='',language='bg'}={}) {
    if(disposed||session)return false;
    const availability=speechAvailability(environment);
    if(availability!=='available'){update({error:availability});return false}
    if(draft.length>=maxLength){update({error:'limit'});return false}
    let recognition;
    try {
      const Recognition=environment.SpeechRecognition||environment.webkitSpeechRecognition;
      recognition=new Recognition();
      recognition.lang=language==='en'?'en-GB':'bg-BG';
      recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
    }catch{update({error:'failed'});return false}
    const current={recognition,base:draft,started:false,ending:false,hasSpeech:false};
    session=current;
    const live=()=>session===current&&!disposed;
    recognition.onstart=()=>{
      if(!live()||current.ending)return;
      current.started=true;update({status:'listening'});
    };
    recognition.onresult=event=>{
      if(!live())return;
      // results contains the whole session. Rebuild it, so repeated/finalized
      // interim hypotheses replace earlier text rather than duplicating it.
      const transcript=Array.from(event.results,result=>result[0]?.transcript?.trim()||'').filter(Boolean).join(' ');
      current.hasSpeech ||= Boolean(transcript);
      if(transcript&&snapshot.error==='silence')update({error:null});
      const separator=current.base&&!/\s$/.test(current.base)&&transcript?' ':'';
      const text=current.base+separator+transcript;
      onDraft(text.slice(0,maxLength));
      if(text.length>=maxLength){update({error:'limit'});stop()}
    };
    recognition.onerror=event=>{
      if(!live())return;
      const error=(event.error==='aborted'||(event.error==='no-speech'&&current.ending))?snapshot.error:errorCode(event.error);
      finish(current,error);abort(current);
    };
    recognition.onnomatch=()=>{if(live())update({error:'silence'})};
    recognition.onend=()=>{
      if(live())finish(current,snapshot.error||(!current.hasSpeech&&!current.ending?'silence':null));
    };
    update({status:'starting',error:null});
    try{recognition.start();return true}
    catch(error){finish(current,error.name==='NotAllowedError'?'permission':'failed');abort(current);return false}
  }
  return {
    start,stop,cancel,
    get active(){return Boolean(session)},
    get snapshot(){return snapshot},
    dispose(){disposed=true;cancel()}
  };
}
