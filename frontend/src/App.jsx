import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUp,ArrowUpRight,ChevronLeft,ChevronRight,Cloud,Info,Layers3,MessageSquare,Mic,PanelRightOpen,Pause,Play,RotateCcw,Square,Wind,X,Zap} from 'lucide-react';
import {CAPACITY,CITIES,COLORS,GEO,NUCLEAR,SEASONS,SITES,TYPES,clock,pos,unproject} from './energy';
import {placeMapLabels} from './mapLabels';
import {requestChat} from './chatApi.js';
import {fetchSimulationState,resetSimulation,subscribeSimulationEvents} from './simulationApi.js';
import {extractActiveFrame} from '../../shared/simulationContract.js';
import {INITIAL_STATE,MAX_MESSAGE_LENGTH,applySimulationPatch,normalizeState} from '../../shared/chatContract.js';

import {useAppSettings} from './AppSettings.jsx';
import ChatDrawer from './ChatDrawer.jsx';
import {useChatHistory} from './useChatHistory.js';
import {formatNumber} from './i18n.js';
import {useDictation} from './useDictation.js';
import {SPEECH_ERRORS} from './speechRecognition.js';

const INITIAL=INITIAL_STATE;

function EnergyMap({state,setState,sim}) {
  const {t,language}=useAppSettings(),fmt=value=>formatNumber(value,language);
  const [cursor,setCursor]=useState(null);
  const [viewport,setViewport]=useState({width:1180,height:620,obstacles:[]});
  const [fontVersion,setFontVersion]=useState(0);
  const planeRef=useRef(null);

  useEffect(()=>{
    const plane=planeRef.current;
    if(!plane)return;
    const measure=()=>{
      const bounds=plane.getBoundingClientRect();
      const obstacles=['.layer-bar','.detail-card','.coords'].flatMap(selector=>{
        const element=plane.closest('.map-card')?.querySelector(selector);
        if(!element)return [];
        const rect=element.getBoundingClientRect();
        return [{x:rect.left-bounds.left-6,y:rect.top-bounds.top-6,w:rect.width+12,h:rect.height+12}];
      });
      setViewport({width:bounds.width,height:bounds.height,obstacles});
    };
    const observer=new ResizeObserver(measure);
    observer.observe(plane);
    const detail=plane.closest('.map-card')?.querySelector('.detail-card');
    if(detail)observer.observe(detail);
    measure();
    return ()=>observer.disconnect();
  },[state.selected,language]);

  useEffect(()=>{
    let active=true;
    document.fonts.ready.then(()=>{if(active)setFontVersion(v=>v+1)});
    return ()=>{active=false};
  },[]);

  const scale=Math.max(.75,Math.min(1,viewport.width/1100,viewport.height/620));

  const nodes=useMemo(()=>{
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
    const measure=name=>{
      if(!context)return name.length*8+12;
      context.font='600 13px "Golos Text"';
      return Math.ceil(context.measureText(name).width)+12;
    };

    // Cities: rendered as outline with no value when unseeded / no data provided by AI
    const cityNodes=state.layers.demand?CITIES.map(city=>{
      const demand=sim?.cityDemand?.[city.id];
      const hasData=typeof demand==='number'&&Number.isFinite(demand);
      return {
        ...city,kind:'city',hasData,value:hasData?demand:null,
        size:(hasData?(15+Math.sqrt(demand)*.75):12)*scale,
        color:COLORS.ink,priority:100,side:city.label
      };
    }):[];

    // Sites: per user specifications, if no data is given for a site by the AI, it is not visualized
    const siteNodes=sim?.siteOut
      ? SITES.filter(site=>state.layers[site.type]&&typeof sim.siteOut[site.id]==='number'&&Number.isFinite(sim.siteOut[site.id])).map(site=>({
          ...site,kind:'site',hasData:true,value:sim.siteOut[site.id],
          size:(14+Math.sqrt(site.cap))*scale,
          color:TYPES[site.type].color,priority:50,side:'right'
        }))
      : [];

    // Nuclear Kozloduy: visualized with output if provided, or outline if unmeasured
    const hasNuclear=typeof sim?.nuclear==='number'&&Number.isFinite(sim.nuclear);
    const nuclearNodes=[{
      ...NUCLEAR,kind:'nuclear',hasData:hasNuclear,value:hasNuclear?sim.nuclear:null,
      size:(hasNuclear?25:15)*scale,color:COLORS.nuclear,priority:75,side:'right'
    }];

    return [...cityNodes,...siteNodes,...nuclearNodes].map(node=>{
      const p=pos(node.lon,node.lat);
      return {
        ...node,
        x:p.x/GEO.width*viewport.width,
        y:p.y/GEO.height*viewport.height,
        radius:node.size/2,
        labelWidth:Math.max(measure(t(node.name)),84),
        priority:node.priority+(state.selected===node.id?100:0)
      };
    });
  },[sim,state.layers,state.selected,viewport.width,viewport.height,scale,fontVersion,language]);

  const labels=useMemo(()=>placeMapLabels(nodes,viewport.width,viewport.height,viewport.obstacles),[nodes,viewport]);

  // Flows: strictly visualized from AI simulation; if no flows provided, array is empty
  const flows=[];
  if(state.layers.flow&&sim?.flows?.length){
    sim.flows.forEach(flow=>{
      const site=SITES.find(s=>s.id===flow.from);
      const city=CITIES.find(c=>c.id===flow.to);
      if(site&&city){
        flows.push({
          id:flow.from+'-'+flow.to,
          a:pos(site.lon,site.lat),
          b:pos(city.lon,city.lat),
          color:flow.color||TYPES[site.type]?.color||'#8a948f',
          highlight:state.selected===flow.from||state.selected===flow.to
        });
      }
    });
  }

  return <div className="map-stage" onMouseLeave={()=>setCursor(null)}>
    <div ref={planeRef} className="map-plane" onMouseMove={event=>{
      const r=event.currentTarget.getBoundingClientRect();
      setCursor(unproject((event.clientX-r.left)/r.width*GEO.width,(event.clientY-r.top)/r.height*GEO.height));
    }}>
      <svg className="map-svg" viewBox={'0 0 '+GEO.width+' '+GEO.height} preserveAspectRatio="none" aria-hidden="true">
        <image href="/assets/bulgaria-geographic.png" x="0" y="0" width={GEO.width} height={GEO.height} preserveAspectRatio="none"/>
        <text x={pos(28.65,42.9).x} y={pos(28.65,42.9).y} textAnchor="end">{t('ЧЕРНО МОРЕ')}</text>
        {flows.map(flow=><path key={flow.id}
          d={'M'+flow.a.x+' '+flow.a.y+' Q'+(flow.a.x+flow.b.x)/2+' '+((flow.a.y+flow.b.y)/2-35)+' '+flow.b.x+' '+flow.b.y}
          className={'flow-line '+(flow.highlight?'highlighted':'')} stroke={flow.color}/>)}
      </svg>
      <svg className="map-leaders" viewBox={'0 0 '+viewport.width+' '+viewport.height} preserveAspectRatio="none" aria-hidden="true">
        {nodes.filter(node=>labels[node.id]?.leader).map(node=>{
          const rect=labels[node.id].rect;
          return <path key={node.id} d={'M'+node.x+' '+node.y+' L'+Math.max(rect.x,Math.min(node.x,rect.x+rect.w))+' '+Math.max(rect.y,Math.min(node.y,rect.y+rect.h))}/>;
        })}
      </svg>
      {nodes.map(node=>{
        const label=labels[node.id],p=pos(node.lon,node.lat);
        const fill=node.kind==='city'?(node.hasData&&node.value>0?Math.min(80,20+(sim?.cityRes?.[node.id]||0)/node.value*60):0):
          node.kind==='site'?(node.hasData&&node.cap>0?Math.min(100,Math.sqrt(node.value/node.cap)*100):0):35;
        const valText=node.hasData?`${fmt(node.value)} MW`:t('Няма данни');
        return <button key={node.id}
          aria-label={t(node.name)+', '+valText} aria-pressed={state.selected===node.id}
          className={'map-point '+node.kind+'-point '+(node.hasData?'has-data':'no-data')+' '+(state.selected===node.id?'selected':'')}
          style={{left:p.x/GEO.width*100+'%',top:p.y/GEO.height*100+'%',width:node.size,height:node.size,'--point-color':node.kind==='city'?'var(--text)':node.color}}
          onClick={()=>setState(value=>({...value,selected:node.id}))}>
          <i style={{width:fill+'%',height:fill+'%'}}/>
          <span className="point-label" style={label?{left:node.radius+label.dx,top:node.radius+label.dy,width:node.labelWidth}:undefined}>
            <b>{t(node.name)}</b><small><em style={{background:node.kind==='city'?'var(--text)':node.color}}/>{node.kind==='nuclear'?'≈':''}{valText}</small>
          </span>
        </button>;
      })}
    </div>
    <div className="coords">{cursor?cursor.lat.toFixed(2)+'°N · '+cursor.lon.toFixed(2)+'°E':t('Премести курсора за координати')}</div>
  </div>;
}

function Detail({state,setState,sim}) {
  const {t,language}=useAppSettings(),fmt=value=>formatNumber(value,language);
  const site=SITES.find(x=>x.id===state.selected),city=CITIES.find(x=>x.id===state.selected);
  let title,kind,color,rows,note,aiNote;

  if(site){
    title=site.name;kind=TYPES[site.type].name;color=TYPES[site.type].color;
    const output=sim?.siteOut?.[site.id];
    const hasData=typeof output==='number'&&Number.isFinite(output);
    rows=[
      ['Местоположение',site.place],
      ['Инсталирана мощност',fmt(site.cap)+' MW'],
      ['Производство сега',hasData?fmt(output)+' MW':t('Няма данни от AI симулация')],
      ['Използване',hasData?Math.round(output/site.cap*100)+'%':'—'],
      ['Захранва',site.to.map(id=>CITIES.find(c=>c.id===id)?.name).join(', ')]
    ];
    note=site.note;
    aiNote=sim?.detail?.[site.id]?.aiDecision||sim?.detail?.[site.id]?.customNotes;
  }else if(city){
    title=city.name;kind='Потребление';color='var(--text)';
    const demand=sim?.cityDemand?.[city.id];
    const resReceived=sim?.cityRes?.[city.id];
    const hasData=typeof demand==='number'&&Number.isFinite(demand);
    rows=[
      ['Потребление сега',hasData?fmt(demand)+' MW':t('Няма данни от AI симулация')],
      ['Дял от страната','≈'+city.share+'%'],
      ['Получава от ВЕИ',typeof resReceived==='number'?fmt(resReceived)+' MW':'—'],
      ['Основни консуматори',city.who]
    ];
    note=hasData?(resReceived>=demand?t('Регионът има ВЕИ покритие.'):t('Остатъкът се балансира от електроенергийната система.')):t('Няма заредени симулационни данни.');
    aiNote=sim?.detail?.[city.id]?.aiDecision||sim?.detail?.[city.id]?.customNotes;
  }else{
    title='АЕЦ Козлодуй';kind='Контекст · невъзобновяема';color=COLORS.nuclear;
    const hasData=typeof sim?.nuclear==='number';
    rows=[
      ['Мощност',hasData?fmt(sim.nuclear)+' MW':'≈2 000 MW'],
      ['Блокове','2 × 1 000 MW'],
      ['Роля','Базово натоварване']
    ];
    note='Показана е за контекст при балансирането на системата.';
    aiNote=sim?.detail?.kozloduy?.aiDecision||sim?.detail?.kozloduy?.customNotes;
  }

  return <div className="detail-card" style={{'--detail-color':color}}>
    <button className="close" aria-label={t('Затвори подробностите')} onClick={()=>setState(s=>({...s,selected:null}))}><X size={16}/></button>
    <span className="kind"><i/>{t(kind)}</span><h3>{t(title)}</h3>
    {rows.map((row,index)=><div className={'detail-row '+(index===0?'first':'')} key={row[0]}><span>{t(row[0])}</span><strong>{row[1]}</strong></div>)}
    {aiNote&&<div className="detail-ai-note"><Zap size={13}/><span><b>{t('AI Решение')}:</b> {aiNote}</span></div>}
    <p><Info size={13}/><span>{t(note)}</span></p>
  </div>;
}

function Stats({sim}) {
  const {t,language}=useAppSettings(),fmt=value=>formatNumber(value,language);

  // If unseeded / waiting for AI simulation, show clean empty state
  if(!sim||typeof sim.res!=='number'||typeof sim.demand!=='number'){
    return <section className="stats empty-stats" aria-label={t('Енергийна статистика')}>
      <div className="stat-lead stat-empty">
        <span className="stat-heading"><Zap size={14}/>{t('Енергиен баланс')}</span>
        <div className="empty-state-card">
          <Info size={18}/>
          <strong>{t('Няма активна симулация')}</strong>
          <p>{t('Зареди данни от AI агент чрез API (/api/simulation/decision) или въведи запитване в асистента.')}</p>
        </div>
      </div>
      <div className="stat-group">
        <span className="stat-heading">{t('Инсталирани мощности')}<small>MW</small></span>
        {Object.keys(CAPACITY).map(key=><div className="mini-row" key={key}>
          <i style={{background:key==='other'?COLORS.other:TYPES[key].color}}/>
          <label>{t(key==='other'?'Биомаса и други':TYPES[key].short)}</label>
          <strong>{fmt(CAPACITY[key])}</strong><small>MW</small>
        </div>)}
      </div>
    </section>;
  }

  const balance=sim.res-sim.demand;
  const coverage=typeof sim.coverage==='number'?sim.coverage:(sim.demand>0?sim.res/sim.demand*100:0);

  return <section className="stats" aria-label={t('Енергийна статистика')}>
    <div className="stat-lead">
      <span className="stat-heading"><Zap size={13}/>{t('Енергиен баланс от AI')}</span>
      <strong>{fmt(sim.res)} <small>MW <em>{t('ВЕИ')}</em></small></strong>
      <p>{t('от')} <b>{fmt(sim.demand)}</b> MW {t('потребление')}</p>
      <div className="coverage"><i style={{width:Math.min(100,coverage)+'%'}}/></div>
      <div className="balance-line"><b>{Math.round(coverage)}% {t('покритие')}</b><span>{t(balance>=0?'Излишък':'Дефицит')} {fmt(Math.abs(balance))} MW</span></div>
    </div>
    {sim.mw&&<div className="stat-group">
      <span className="stat-heading">{t('Производство по източници')}<small>MW</small></span>
      {Object.keys(CAPACITY).map(key=><div className="mini-row" key={key}>
        <i style={{background:key==='other'?COLORS.other:TYPES[key].color}}/>
        <label>{t(key==='other'?'Биомаса и други':TYPES[key].short)}</label>
        <strong>{fmt(sim.mw[key]||0)}</strong><small>/ {fmt(CAPACITY[key])}</small>
      </div>)}
    </div>}
    {sim.sectors?.length>0&&<div className="stat-group sectors">
      <span className="stat-heading">{t('Потребление по сектори')}<small>MW</small></span>
      {sim.sectors.map(sector=><div className="mini-row" key={sector.label}>
        <label>{t(sector.label)}</label><div className="bar"><i style={{width:sector.pct*100+'%',background:sector.color===COLORS.ink?'var(--text)':sector.color}}/></div>
        <strong>{fmt(sector.mw)}</strong>
      </div>)}
    </div>}
  </section>;
}

function AIDecisionBanner({simulation,currentStep,isPlaying,setIsPlaying,onReplay,onReset}) {
  const {t}=useAppSettings();
  if(!simulation)return null;

  const decision=simulation.decision||{};
  return <div className="ai-decision-banner" role="region" aria-label={t('AI Решение и Симулация')}>
    <div className="ai-banner-lead">
      <div className="ai-badge">
        <Zap size={14}/>
        <span>{t('AI Симулация')}</span>
        {simulation.isTimeline&&(
          <span className="frame-counter">
            {currentStep+1} / {simulation.totalSteps}
          </span>
        )}
      </div>
      <div className="ai-prompt-box">
        <strong className="ai-prompt-title">{t('Промпт')}:</strong>
        <span className="ai-prompt-text">{simulation.prompt}</span>
      </div>
      <div className="ai-actions-bar">
        {simulation.isTimeline&&(
          <button type="button" className="banner-btn" onClick={()=>setIsPlaying(!isPlaying)} title={isPlaying?t('Пауза'):t('Пусни')}>
            {isPlaying?<Pause size={14}/>:<Play size={14}/>}
            <span>{isPlaying?t('Пауза'):t('Пусни')}</span>
          </button>
        )}
        <button type="button" className="banner-btn" onClick={onReplay} title={t('Преиграй симулацията')}>
          <RotateCcw size={14}/>
          <span>{t('Преиграй')}</span>
        </button>
        <button type="button" className="banner-btn reset-btn" onClick={onReset} title={t('Изчисти симулацията')}>
          <X size={14}/>
          <span>{t('Изчисти')}</span>
        </button>
      </div>
    </div>
    {(decision.summary||decision.answer)&&<div className="ai-decision-content">
      <p className="ai-summary">
        <b>{t('Решение')}: </b>{decision.summary||decision.answer}
      </p>
      {decision.actions?.length>0&&<div className="ai-action-chips">
        {decision.actions.map((act,idx)=><span className="action-chip" key={idx}>
          <small>{act.component||'action'}</small>
          <b>{act.target||act.action}</b>
          {act.value!==undefined&&<em>{act.value>0?`+${act.value}`:act.value} MW</em>}
        </span>)}
      </div>}
    </div>}
  </div>;
}

function Chat({state,setState,collapsed,setCollapsed,activeSimulation}) {
  const {t,language,user,sessionReady,errorText}=useAppSettings();
  const historyStore=useChatHistory(user?.id);
  const [draft,setDraft]=useState(''),[msgs,setMsgs]=useState([{role:'bot',initial:true,text:''}]);
  const [conversationId,setConversationId]=useState(()=>crypto.randomUUID());
  const [pending,setPending]=useState(false),[restoring,setRestoring]=useState(false),[aiStatus,setAIStatus]=useState({configured:null});
  const [sidebarOpen,setSidebarOpen]=useState(false),sidebarTrigger=useRef(null);
  const draftRef=useRef(null);
  const dictation=useDictation({language,setDraft,maxLength:MAX_MESSAGE_LENGTH,
    disabled:pending||restoring||!sessionReady||sidebarOpen||collapsed});
  const closeSidebar=useCallback(()=>setSidebarOpen(false),[]);

  const listRef=useRef(null),requestRef=useRef(null),pendingRef=useRef(false),restoringRef=useRef(false),mountedRef=useRef(false);

  useEffect(()=>{
    mountedRef.current=true;
    const controller=new AbortController();
    fetch('/api/health',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])})
      .then(response=>{if(!response.ok)throw new Error('API unavailable');return response.json()})
      .then(data=>{if(mountedRef.current&&!controller.signal.aborted)setAIStatus(data.ai||{error:true})})
      .catch(()=>{if(mountedRef.current&&!controller.signal.aborted)setAIStatus({error:true})});
    return ()=>{mountedRef.current=false;controller.abort();requestRef.current?.abort()};
  },[]);

  useEffect(()=>{
    const list=listRef.current;
    if(list)list.scrollTo({top:list.scrollHeight,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  },[msgs,collapsed,pending]);

  function save(messages,scenario){
    const data=messages.filter(message=>!message.initial&&!message.error).slice(-80)
      .map(message=>({role:message.role==='bot'?'assistant':'user',content:message.text}));
    if(data.length)void historyStore.save({id:conversationId,title:data.find(message=>message.role==='user')?.content.slice(0,80)||t('Разговор'),
      updatedAt:new Date().toISOString(),messages:data,state:scenario});
  }

  async function restore(id){
    if(pendingRef.current||restoringRef.current)return;
    dictation.cancel();
    restoringRef.current=true;setRestoring(true);
    try{
      const record=await historyStore.load(id);
      if(!record||!mountedRef.current)return;
      setState({...normalizeState(record.state),playing:false});
      setMsgs([{role:'bot',initial:true,text:''},...record.messages.map(message=>({role:message.role==='assistant'?'bot':'user',text:message.content}))]);
      setConversationId(record.id);setDraft('');
    }finally{
      restoringRef.current=false;if(mountedRef.current)setRestoring(false);
    }
  }

  function newConversation(){
    if(pendingRef.current||restoringRef.current)return;
    dictation.cancel();
    setMsgs([{role:'bot',initial:true,text:''}]);setConversationId(crypto.randomUUID());setDraft('');
  }

  async function send(text){
    const clean=text.trim();
    if(!clean||dictation.isActive()||pendingRef.current||restoringRef.current||!sessionReady||clean.length>MAX_MESSAGE_LENGTH)return;
    pendingRef.current=true;setPending(true);
    const controller=new AbortController();requestRef.current=controller;
    const history=msgs.filter(message=>!message.initial&&!message.error)
      .map(message=>({role:message.role==='bot'?'assistant':'user',content:message.text})).slice(-8);
    const sent=[...msgs,{role:'user',text:clean}];
    setMsgs(sent);save(sent,state);setDraft('');
    try {
      const result=await requestChat({message:clean,history,state,language},{signal:controller.signal});
      if(!mountedRef.current||controller.signal.aborted)return;
      const completed=[...sent,{role:'bot',text:result.reply}];
      setState(current=>applySimulationPatch(current,result.patch));
      setMsgs(completed);save(completed,applySimulationPatch(state,result.patch));
      setAIStatus({configured:true,provider:result.provider,model:result.model});
    }catch(error){
      if(!mountedRef.current||controller.signal.aborted)return;
      setMsgs([...sent,{role:'bot',error:true,failure:error,text:error.message}]);
      setDraft(current=>current||clean);
      if(['AI_NOT_CONFIGURED','AI_AUTH_ERROR','MCP_NOT_CONFIGURED'].includes(error.code))setAIStatus({configured:false});
    }finally{
      pendingRef.current=false;requestRef.current=null;
      if(mountedRef.current)setPending(false);
    }
  }

  const statusText=!sessionReady?'Проверка на профила…':restoring?'Зареждане…':pending?'AI подготвя отговор…':aiStatus.error?'Няма връзка с backend-а':
    aiStatus.configured===false?'AI не е настроен · нужен е API ключ':
    aiStatus.configured===true?(aiStatus.provider==='groq'?'Groq · тестов AI':'AI · свързан'):'Проверка на AI връзката…';
  const speechError=dictation.error||(dictation.availability!=='available'?dictation.availability:null);
  const speechStatus=speechError?SPEECH_ERRORS[speechError]:({
    starting:'Разреши микрофона, ако браузърът поиска достъп…',
    listening:'Слушам… Спри диктовката, прегледай текста и го изпрати.',
    stopping:'Завършвам диктовката…'
  })[dictation.status];
  const micLabel=dictation.active?'Спри диктовката':language==='en'?'Диктувай на английски':'Диктувай на български';

  if(collapsed)return <button className="chat-open" aria-label={t('Отвори енергийния асистент')} onClick={()=>setCollapsed(false)}>
    <MessageSquare size={20}/><span>{t('Енергиен асистент')}</span><ChevronLeft size={18}/>
  </button>;

  return <aside className="chat" aria-label={t('Енергиен асистент')}>
    <header inert={sidebarOpen}>
      <div className="chat-logo"><Zap size={19} fill="currentColor"/></div>
      <div><strong>{t('Енергиен асистент')}</strong><span className={aiStatus.error||aiStatus.configured===false?'ai-offline':''}><i/> {t(statusText)}</span></div>
      <button className="header-icon drawer-trigger" ref={sidebarTrigger} title={t('Отвори менюто')} aria-label={t('Отвори менюто')}
        aria-expanded={sidebarOpen} aria-controls="chat-drawer" onClick={()=>{dictation.cancel();setSidebarOpen(true)}}><PanelRightOpen size={18}/></button>
      <button aria-label={t('Свий чата')} onClick={()=>{dictation.cancel();setCollapsed(true)}}><ChevronRight size={18}/></button>
    </header>
    {historyStore.notice&&<div className="history-notice" role="status" inert={sidebarOpen}>{errorText(historyStore.notice)}</div>}
    <div className="messages" ref={listRef} aria-live="polite" aria-relevant="additions" inert={sidebarOpen}>
      {msgs.map((message,index)=><div className={'message '+message.role+(message.error?' error':'')} key={index}>
        {message.role==='bot'&&<span className="bot-dot"><Zap size={13}/></span>}
        <div className="message-body"><small>{t(message.error?'Връзка с AI':message.role==='bot'?'Енергиен асистент':'Ти')}</small>
          <p>{message.initial?t('welcome'):message.error?errorText(message.failure):message.text}</p></div>
      </div>)}
      {pending&&<div className="message bot"><span className="bot-dot"><Zap size={13}/></span>
        <div className="message-body"><small>{t('Енергиен асистент')}</small><p className="typing" role="status" aria-label={t('AI подготвя отговор…')}><i/><i/><i/></p></div></div>}
    </div>
    <div className="chips" aria-label={t('Примерни въпроси')} inert={sidebarOpen}>
      {['Колко дава слънцето?','Къде се харчи най-много?','Покажи зима вечер'].map(text=><button type="button" disabled={pending||restoring||!sessionReady||dictation.active}
        onClick={()=>send(t(text))} key={text}>{t(text)}<ArrowUpRight size={12}/></button>)}
    </div>
    <form inert={sidebarOpen} className={dictation.active?'dictating':''} onSubmit={event=>{event.preventDefault();send(draft)}}>
      <textarea ref={draftRef} aria-label={t('Въпрос към енергийния асистент')} maxLength={MAX_MESSAGE_LENGTH} value={draft}
        readOnly={dictation.active} onChange={event=>setDraft(event.target.value)}
        onKeyDown={event=>{
          if(event.key==='Escape'&&dictation.isActive()){event.preventDefault();dictation.stop()}
          if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(dictation.isActive())dictation.stop();else send(draft)}
        }}
        placeholder={t('Попитай за енергията…')} rows="2"/>
      <button type="button" className="mic-button" data-active={dictation.active} aria-label={t(micLabel)} aria-pressed={dictation.active}
        aria-describedby="dictation-help" title={t(speechError?SPEECH_ERRORS[speechError]:micLabel)+' · '+t('Гласът може да се обработва от външната услуга на браузъра.')}
        disabled={dictation.availability!=='available'||pending||restoring||!sessionReady||dictation.status==='stopping'}
        onClick={()=>{if(dictation.isActive())dictation.stop();else if(dictation.start(draft))draftRef.current?.focus({preventScroll:true})}}>
        {dictation.active?<Square size={14} fill="currentColor"/>:<Mic size={18}/>}
      </button>
      <button type="submit" aria-label={t('Изпрати съобщението')} disabled={pending||restoring||!sessionReady||dictation.active||!draft.trim()}><ArrowUp size={19}/></button>
    </form>
    <span id="dictation-help" className="sr-only">{t('Гласът може да се обработва от външната услуга на браузъра.')} {t('Диктовката не изпраща съобщението автоматично.')}</span>
    <div className={'dictation-status'+(speechError?' warning':'')} role="status" aria-live="polite" inert={sidebarOpen}>{speechStatus?t(speechStatus):''}</div>
    <small className="chat-note" inert={sidebarOpen}><Info size={11}/>{t('Тестов AI · симулация, не данни на живо.')}</small>
    <ChatDrawer open={sidebarOpen} onClose={closeSidebar} triggerRef={sidebarTrigger} history={historyStore} currentId={conversationId}
      onSelect={restore} onNew={newConversation} disabled={pending||restoring||!sessionReady}/>
  </aside>;
}

export default function App() {
  const {t,user}=useAppSettings();
  const [state,setState]=useState(INITIAL),[chatCollapsed,setChatCollapsed]=useState(false);
  const [simulation,setSimulation]=useState(null);
  const [currentStep,setCurrentStep]=useState(0);
  const [playingTimeline,setPlayingTimeline]=useState(false);

  // Synchronize simulation data with backend and SSE push updates
  useEffect(()=>{
    let active=true;
    fetchSimulationState().then(data=>{
      if(active&&data?.active&&data?.simulation){
        setSimulation(data.simulation);
        setCurrentStep(0);
      }
    });

    const unsubscribe=subscribeSimulationEvents(event=>{
      if(!active)return;
      if(event.type==='update'||event.type==='init'){
        if(event.active&&event.simulation){
          setSimulation(event.simulation);
          setCurrentStep(0);
        }else if(event.type==='init'&&!event.active){
          setSimulation(null);
        }
      }else if(event.type==='reset'){
        setSimulation(null);
        setCurrentStep(0);
        setPlayingTimeline(false);
      }
    });

    return ()=>{
      active=false;
      unsubscribe();
    };
  },[]);

  // Timeline playback for multi-step simulations
  useEffect(()=>{
    if(!playingTimeline||!simulation||!simulation.isTimeline)return;
    const duration=simulation.scenario?.stepDurationMs||1200;
    const timer=setInterval(()=>{
      setCurrentStep(s=>{
        if(s+1>=simulation.totalSteps){
          setPlayingTimeline(false);
          return s;
        }
        return s+1;
      });
    },duration);
    return ()=>clearInterval(timer);
  },[playingTimeline,simulation]);

  const activeFrame=useMemo(()=>{
    if(!simulation)return null;
    return extractActiveFrame(simulation,currentStep);
  },[simulation,currentStep]);

  // Construct active simulation view strictly from AI frame data; no fake seeded fallback numbers
  const sim=useMemo(()=>{
    if(!activeFrame)return null;
    return {
      stats:activeFrame.stats,
      mw:activeFrame.stats?.mw||null,
      res:activeFrame.stats?.res??null,
      demand:activeFrame.stats?.demand??null,
      coverage:activeFrame.stats?.coverage??null,
      balance:activeFrame.stats?.balance??null,
      sectors:activeFrame.stats?.sectors||[],
      siteOut:activeFrame.map?.sites
        ?Object.fromEntries(Object.entries(activeFrame.map.sites).map(([id,d])=>[id,d.output]))
        :{},
      cityDemand:activeFrame.map?.cities
        ?Object.fromEntries(Object.entries(activeFrame.map.cities).map(([id,d])=>[id,d.demand]))
        :{},
      cityRes:activeFrame.map?.cities
        ?Object.fromEntries(Object.entries(activeFrame.map.cities).map(([id,d])=>[id,d.resReceived??0]))
        :{},
      flows:activeFrame.map?.flows||[],
      nuclear:activeFrame.map?.nuclear?.output??null,
      detail:activeFrame.detail||{}
    };
  },[activeFrame]);

  const handleReplay=useCallback(()=>{
    setCurrentStep(0);
    if(simulation?.isTimeline){
      setPlayingTimeline(true);
    }
  },[simulation]);

  const handleReset=useCallback(async()=>{
    try{
      await resetSimulation();
    }catch{}
    setSimulation(null);
    setCurrentStep(0);
    setPlayingTimeline(false);
    setState(INITIAL);
  },[]);

  const toggleLayer=key=>setState(s=>({...s,layers:{...s.layers,[key]:!s.layers[key]}}));

  const displayHour=activeFrame?activeFrame.hour:state.hour;
  const displaySeason=simulation?.scenario?.season||state.season;

  return <div className={'energy-app '+(chatCollapsed?'chat-collapsed':'')}>
    <main>
      <header className="top">
        <div className="brand"><div><Zap size={19} fill="currentColor"/></div><span><strong>{t('Енергия')}</strong><small>{t('България')}</small></span></div>
        <div className="top-center">
          <b>{t(SEASONS[displaySeason]?.name||'Зима')}</b>
          <span className="time-divider"/>
          <strong>{clock(displayHour)}</strong>
          <em><i/>{simulation?t('AI СИМУЛАЦИЯ'):t('ИЗЧАКВАНЕ')}</em>
        </div>
        <div className="top-actions">
          <button className="reset" aria-label={t('Нулирай')} onClick={handleReset}>
            <RotateCcw size={14}/><span>{t('Нулирай')}</span>
          </button>
        </div>
      </header>

      <AIDecisionBanner
        simulation={simulation}
        currentStep={currentStep}
        isPlaying={playingTimeline}
        setIsPlaying={setPlayingTimeline}
        onReplay={handleReplay}
        onReset={handleReset}
      />

      <div className="content">
        <section className="map-card" aria-label={t('Енергийна карта на България')}>
          <div className="layer-bar">
            <span><Layers3 size={14}/>{t('Слоеве')}</span>
            {[['solar','Слънце',COLORS.solar],['wind','Вятър',COLORS.wind],['hydro','Вода',COLORS.hydro],['demand','Потребление',COLORS.ink],['flow','Потоци','#8a948f']].map(([key,label,color])=>
              <button type="button" aria-pressed={state.layers[key]} className={state.layers[key]?'active':''} onClick={()=>toggleLayer(key)} key={key}>
                <i style={{'--layer-color':key==='demand'?'var(--text)':color}}/>{t(label)}<span className="layer-toggle"/>
              </button>)}
          </div>
          <EnergyMap state={state} setState={setState} sim={sim}/>
          {state.selected&&<Detail state={state} setState={setState} sim={sim}/>}
        </section>

        <Stats sim={sim}/>

        <section className="controls" aria-label={t('Управление на симулацията')}>
          {simulation?.isTimeline?(
            <>
              <button
                className={'play '+(playingTimeline?'playing':'')}
                aria-label={t(playingTimeline?'Пауза':'Пусни симулацията')}
                aria-pressed={playingTimeline}
                onClick={()=>setPlayingTimeline(!playingTimeline)}
              >
                {playingTimeline?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}
              </button>
              <label className="control wide timeline-scrubber">
                <span>{t('Кадър')}<strong>{activeFrame?.label||`${currentStep+1}/${simulation.totalSteps}`}</strong></span>
                <input
                  aria-label={t('Кадър от симулацията')}
                  className="timeline-slider"
                  type="range"
                  min="0"
                  max={simulation.totalSteps-1}
                  step="1"
                  value={currentStep}
                  style={{'--range-fill':`${(currentStep/(Math.max(1,simulation.totalSteps-1)))*100}%`}}
                  onChange={e=>{setPlayingTimeline(false);setCurrentStep(+e.target.value);}}
                />
              </label>
              <button type="button" className="banner-btn" onClick={handleReplay} title={t('Преиграй')}>
                <RotateCcw size={15}/><span>{t('Преиграй')}</span>
              </button>
            </>
          ):(
            <>
              <div className="control">
                <span>{t('Статус')}<strong>{simulation?t('AI Активна'):t('Няма данни')}</strong></span>
              </div>
              <label className="control wide">
                <span>{t('Час')}<strong>{clock(displayHour)}</strong></span>
                <input
                  aria-label={t('Час от денонощието')}
                  type="range"
                  min="0"
                  max="23.75"
                  step=".25"
                  value={displayHour}
                  disabled={Boolean(simulation)}
                  style={{'--range-fill':`${(displayHour/23.75)*100}%`}}
                  onChange={e=>setState(s=>({...s,hour:+e.target.value}))}
                />
              </label>
            </>
          )}

          <div className="seasons" aria-label={t('Сезон')}>
            {Object.entries(SEASONS).map(([key,value])=><button
              aria-pressed={displaySeason===key}
              className={displaySeason===key?'active':''}
              disabled={Boolean(simulation)}
              onClick={()=>setState(s=>({...s,season:key}))}
              key={key}
            >{t(value.name)}</button>)}
          </div>
          <div className="control">
            <span><Cloud size={14}/>{t('Облачност')}<strong>{simulation?.scenario?.cloud??state.cloud}%</strong></span>
          </div>
          <div className="control">
            <span><Wind size={14}/>{t('Вятър')}<strong>{simulation?.scenario?.wind??state.wind}%</strong></span>
          </div>
        </section>

        <footer><Info size={12}/>{t('Визуализация на симулации от AI агент. Данните се подават в реално време чрез API.')}</footer>
      </div>
    </main>

    <Chat
      key={user?.id||'guest'}
      state={state}
      setState={setState}
      collapsed={chatCollapsed}
      setCollapsed={setChatCollapsed}
      activeSimulation={simulation}
    />
  </div>;
}
