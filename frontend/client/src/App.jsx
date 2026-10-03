import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUp,ArrowUpRight,ChevronLeft,ChevronRight,Cloud,Info,Layers3,MessageSquare,PanelRightOpen,Pause,Play,RotateCcw,Wind,X,Zap} from 'lucide-react';
import {CAPACITY,CITIES,COLORS,GEO,NUCLEAR,SEASONS,SITES,TYPES,clock,pos,unproject,simulate} from './energy';
import {placeMapLabels} from './mapLabels';
import {requestChat} from './chatApi.js';
import {INITIAL_STATE,MAX_MESSAGE_LENGTH,applySimulationPatch,normalizeState} from '../../shared/chatContract.js';

import {useAppSettings} from './AppSettings.jsx';
import ChatDrawer from './ChatDrawer.jsx';
import {useChatHistory} from './useChatHistory.js';
import {formatNumber} from './i18n.js';

const INITIAL=INITIAL_STATE;


function EnergyMap({state,setState,sim}) {
  const {t,language}=useAppSettings(),fmt=value=>formatNumber(value,language);
  const [cursor,setCursor]=useState(null);
  const [viewport,setViewport]=useState({width:1180,height:620,obstacles:[]});
  const [fontVersion,setFontVersion]=useState(0);
  const planeRef=useRef(null);

  useEffect(()=>{
    const plane=planeRef.current;
    const measure=()=>{
      const bounds=plane.getBoundingClientRect();
      const obstacles=['.layer-bar','.detail-card','.coords'].flatMap(selector=>{
        const element=plane.closest('.map-card').querySelector(selector);
        if(!element)return [];
        const rect=element.getBoundingClientRect();
        return [{x:rect.left-bounds.left-6,y:rect.top-bounds.top-6,w:rect.width+12,h:rect.height+12}];
      });
      setViewport({width:bounds.width,height:bounds.height,obstacles});
    };
    const observer=new ResizeObserver(measure);
    observer.observe(plane);
    const detail=plane.closest('.map-card').querySelector('.detail-card');
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
    const cityNodes=state.layers.demand?CITIES.map(city=>({
      ...city,kind:'city',value:sim.cityDemand[city.id],
      size:(15+Math.sqrt(sim.cityDemand[city.id])*.75)*scale,
      color:COLORS.ink,priority:100,side:city.label
    })):[];
    const siteNodes=SITES.filter(site=>state.layers[site.type]).map(site=>({
      ...site,kind:'site',value:sim.siteOut[site.id],
      size:(14+Math.sqrt(site.cap))*scale,
      color:TYPES[site.type].color,priority:50,side:'right'
    }));
    return [...cityNodes,...siteNodes,{
      ...NUCLEAR,kind:'nuclear',value:2000,size:25*scale,
      color:COLORS.nuclear,priority:75,side:'right'
    }].map(node=>{
      const p=pos(node.lon,node.lat);
      return {...node,x:p.x/GEO.width*viewport.width,y:p.y/GEO.height*viewport.height,
        radius:node.size/2,labelWidth:Math.max(measure(t(node.name)),84),
        priority:node.priority+(state.selected===node.id?100:0)};
    });
  },[sim,state.layers,state.selected,viewport.width,viewport.height,scale,fontVersion,language]);
  const labels=useMemo(()=>placeMapLabels(nodes,viewport.width,viewport.height,viewport.obstacles),[nodes,viewport]);
  const flows=[];
  if(state.layers.flow&&state.layers.demand){
    SITES.filter(site=>state.layers[site.type]).forEach(site=>site.to.forEach(id=>{
      const city=CITIES.find(c=>c.id===id);
      flows.push({id:site.id+id,a:pos(site.lon,site.lat),b:pos(city.lon,city.lat),
        color:TYPES[site.type].color,highlight:state.selected===id||state.selected===site.id});
    }));
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
        const fill=node.kind==='city'?Math.min(80,20+sim.cityRes[node.id]/node.value*60):
          node.kind==='site'?Math.min(100,Math.sqrt(node.value/node.cap)*100):35;
        return <button key={node.id}
          aria-label={t(node.name)+', '+fmt(node.value)+' MW'} aria-pressed={state.selected===node.id}
          className={'map-point '+node.kind+'-point '+(state.selected===node.id?'selected':'')}
          style={{left:p.x/GEO.width*100+'%',top:p.y/GEO.height*100+'%',width:node.size,height:node.size,'--point-color':node.kind==='city'?'var(--text)':node.color}}
          onClick={()=>setState(value=>({...value,selected:node.id}))}>
          <i style={{width:fill+'%',height:fill+'%'}}/>
          <span className="point-label" style={label?{left:node.radius+label.dx,top:node.radius+label.dy,width:node.labelWidth}:undefined}>
            <b>{t(node.name)}</b><small><em style={{background:node.kind==='city'?'var(--text)':node.color}}/>{node.kind==='nuclear'?'≈':''}{fmt(node.value)} MW</small>
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
  let title,kind,color,rows,note;
  if(site){
    title=site.name;kind=TYPES[site.type].name;color=TYPES[site.type].color;
    rows=[['Местоположение',site.place],['Инсталирана мощност',fmt(site.cap)+' MW'],
      ['Производство сега',fmt(sim.siteOut[site.id])+' MW'],
      ['Използване',Math.round(sim.siteOut[site.id]/site.cap*100)+'%'],
      ['Захранва',site.to.map(id=>CITIES.find(c=>c.id===id)?.name).join(', ')]];
    note=site.note;
  }else if(city){
    title=city.name;kind='Потребление';color='var(--text)';
    rows=[['Потребление сега',fmt(sim.cityDemand[city.id])+' MW'],['Дял от страната','≈'+city.share+'%'],
      ['Получава от ВЕИ',fmt(Math.min(sim.cityRes[city.id],sim.cityDemand[city.id]))+' MW'],
      ['ВЕИ източници',sim.cityFrom[city.id].map(x=>x.site.name).join(', ')||'Няма показани'],
      ['Основни консуматори',city.who]];
    note=sim.cityRes[city.id]>sim.cityDemand[city.id]?'Регионът има ВЕИ излишък.':'Остатъкът идва от общата електроенергийна система.';
  }else{
    title='АЕЦ Козлодуй';kind='Контекст · невъзобновяема';color=COLORS.nuclear;
    rows=[['Мощност','≈2 000 MW'],['Блокове','2 × 1 000 MW'],['Роля','Базово натоварване']];
    note='Показана е за контекст при балансирането на системата.';
  }
  return <div className="detail-card" style={{'--detail-color':color}}>
    <button className="close" aria-label={t('Затвори подробностите')} onClick={()=>setState(s=>({...s,selected:null}))}><X size={16}/></button>
    <span className="kind"><i/>{t(kind)}</span><h3>{t(title)}</h3>
    {rows.map((row,index)=><div className={'detail-row '+(index===0?'first':'')} key={row[0]}><span>{t(row[0])}</span><strong>{t(row[1])}</strong></div>)}
    <p><Info size={13}/><span>{t(note)}</span></p>
  </div>;
}

function Stats({sim}) {
  const {t,language}=useAppSettings(),fmt=value=>formatNumber(value,language);
  const balance=sim.res-sim.demand;
  return <section className="stats" aria-label={t('Енергийна статистика')}>
    <div className="stat-lead">
      <span className="stat-heading"><Zap size={13}/>{t('Енергиен баланс сега')}</span>
      <strong>{fmt(sim.res)} <small>MW <em>{t('ВЕИ')}</em></small></strong>
      <p>{t('от')} <b>{fmt(sim.demand)}</b> MW {t('потребление')}</p>
      <div className="coverage"><i style={{width:Math.min(100,sim.coverage)+'%'}}/></div>
      <div className="balance-line"><b>{Math.round(sim.coverage)}% {t('покритие')}</b><span>{t(balance>=0?'Излишък':'Дефицит')} {fmt(Math.abs(balance))} MW</span></div>
    </div>
    <div className="stat-group">
      <span className="stat-heading">{t('Производство по източници')}<small>MW</small></span>
      {Object.keys(CAPACITY).map(key=><div className="mini-row" key={key}>
        <i style={{background:key==='other'?COLORS.other:TYPES[key].color}}/>
        <label>{t(key==='other'?'Биомаса и други':TYPES[key].short)}</label>
        <strong>{fmt(sim.mw[key])}</strong><small>/ {fmt(CAPACITY[key])}</small>
      </div>)}
    </div>
    <div className="stat-group sectors">
      <span className="stat-heading">{t('Потребление по сектори')}<small>MW</small></span>
      {sim.sectors.map(sector=><div className="mini-row" key={sector.label}>
        <label>{t(sector.label)}</label><div className="bar"><i style={{width:sector.pct*100+'%',background:sector.color===COLORS.ink?'var(--text)':sector.color}}/></div>
        <strong>{fmt(sector.mw)}</strong>
      </div>)}
    </div>
    <div className="annual">
      <span className="stat-heading"><span className="year">2024</span>{t('Годишен контекст')}</span>
      {[['Производство','34,27 TWh'],['Потребление','33,16 TWh'],['От ВЕИ','≈6,26 TWh'],['ВЕИ мощност','6 757 MW'],['Нетен износ','1,11 TWh']].map(([label,value])=><div key={label}><label>{t(label)}</label><strong>{language==='en'?value.replace(',','.'):value}</strong></div>)}
      <small>{t('Източници: ЕСО, КЕВР, ИПИ')}</small>
    </div>
  </section>;
}

function Chat({state,setState,collapsed,setCollapsed}) {
  const {t,language,user,sessionReady,errorText}=useAppSettings();
  const historyStore=useChatHistory(user?.id);
  const [draft,setDraft]=useState(''),[msgs,setMsgs]=useState([{role:'bot',initial:true,text:''}]);
  const [conversationId,setConversationId]=useState(()=>crypto.randomUUID());
  const [pending,setPending]=useState(false),[restoring,setRestoring]=useState(false),[aiStatus,setAIStatus]=useState({configured:null});
  const [sidebarOpen,setSidebarOpen]=useState(false),sidebarTrigger=useRef(null);
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
    setMsgs([{role:'bot',initial:true,text:''}]);setConversationId(crypto.randomUUID());setDraft('');
  }
  async function send(text){
    const clean=text.trim();
    if(!clean||pendingRef.current||restoringRef.current||!sessionReady||clean.length>MAX_MESSAGE_LENGTH)return;
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
  if(collapsed)return <button className="chat-open" aria-label={t('Отвори енергийния асистент')} onClick={()=>setCollapsed(false)}>
    <MessageSquare size={20}/><span>{t('Енергиен асистент')}</span><ChevronLeft size={18}/>
  </button>;
  return <aside className="chat" aria-label={t('Енергиен асистент')}>
    <header inert={sidebarOpen}>
      <div className="chat-logo"><Zap size={19} fill="currentColor"/></div>
      <div><strong>{t('Енергиен асистент')}</strong><span className={aiStatus.error||aiStatus.configured===false?'ai-offline':''}><i/> {t(statusText)}</span></div>
      <button className="header-icon drawer-trigger" ref={sidebarTrigger} title={t('Отвори менюто')} aria-label={t('Отвори менюто')}
        aria-expanded={sidebarOpen} aria-controls="chat-drawer" onClick={()=>setSidebarOpen(true)}><PanelRightOpen size={18}/></button>
      <button aria-label={t('Свий чата')} onClick={()=>setCollapsed(true)}><ChevronRight size={18}/></button>
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
      {['Колко дава слънцето?','Къде се харчи най-много?','Покажи зима вечер'].map(text=><button type="button" disabled={pending||restoring||!sessionReady}
        onClick={()=>send(t(text))} key={text}>{t(text)}<ArrowUpRight size={12}/></button>)}
    </div>
    <form inert={sidebarOpen} onSubmit={event=>{event.preventDefault();send(draft)}}>
      <textarea aria-label={t('Въпрос към енергийния асистент')} maxLength={MAX_MESSAGE_LENGTH} value={draft} onChange={event=>setDraft(event.target.value)}
        onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();send(draft)}}}
        placeholder={t('Попитай за енергията…')} rows="2"/>
      <button type="submit" aria-label={t('Изпрати съобщението')} disabled={pending||restoring||!sessionReady||!draft.trim()}><ArrowUp size={19}/></button>
    </form>
    <small className="chat-note" inert={sidebarOpen}><Info size={11}/>{t('Тестов AI · симулация, не данни на живо.')}</small>
    <ChatDrawer open={sidebarOpen} onClose={closeSidebar} triggerRef={sidebarTrigger} history={historyStore} currentId={conversationId}
      onSelect={restore} onNew={newConversation} disabled={pending||restoring||!sessionReady}/>
  </aside>;
}

export default function App() {
  const {t,user}=useAppSettings();
  const [state,setState]=useState(INITIAL),[chatCollapsed,setChatCollapsed]=useState(false);
  const sim=useMemo(()=>simulate(state),[state]);
  useEffect(()=>{
    if(!state.playing)return;
    const timer=setInterval(()=>setState(s=>({...s,hour:(s.hour+.25)%24})),250);
    return ()=>clearInterval(timer);
  },[state.playing]);
  const toggleLayer=key=>setState(s=>({...s,layers:{...s.layers,[key]:!s.layers[key]}}));
  return <div className={'energy-app '+(chatCollapsed?'chat-collapsed':'')}>
    <main>
      <header className="top">
        <div className="brand"><div><Zap size={19} fill="currentColor"/></div><span><strong>{t('Енергия')}</strong><small>{t('България')}</small></span></div>
        <div className="top-center"><b>{t(SEASONS[state.season].name)}</b><span className="time-divider"/><strong>{clock(state.hour)}</strong><em><i/>{t('СИМУЛАЦИЯ')}</em></div>
        <div className="top-actions"><button className="reset" aria-label={t('Нулирай')} onClick={()=>setState(INITIAL)}><RotateCcw size={14}/><span>{t('Нулирай')}</span></button></div>
      </header>
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
          <button className={'play '+(state.playing?'playing':'')} aria-label={t(state.playing?'Пауза':'Пусни симулацията')} aria-pressed={state.playing}
            onClick={()=>setState(s=>({...s,playing:!s.playing}))}>{state.playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button>
          <label className="control wide"><span>{t('Час')}<strong>{clock(state.hour)}</strong></span>
            <input aria-label={t('Час от денонощието')} type="range" min="0" max="23.75" step=".25" value={state.hour}
              style={{'--range-fill':state.hour/23.75*100+'%'}} onChange={event=>setState(s=>({...s,hour:+event.target.value}))}/></label>
          <div className="seasons" aria-label={t('Сезон')}>
            {Object.entries(SEASONS).map(([key,value])=><button aria-pressed={state.season===key} className={state.season===key?'active':''}
              onClick={()=>setState(s=>({...s,season:key}))} key={key}>{t(value.name)}</button>)}
          </div>
          <label className="control"><span><Cloud size={14}/>{t('Облачност')}<strong>{state.cloud}%</strong></span>
            <input aria-label={t('Облачност')} className="solar-range" type="range" min="0" max="100" step="5" value={state.cloud}
              style={{'--range-fill':state.cloud+'%'}} onChange={event=>setState(s=>({...s,cloud:+event.target.value}))}/></label>
          <label className="control"><span><Wind size={14}/>{t('Вятър')}<strong>{state.wind}%</strong></span>
            <input aria-label={t('Сила на вятъра')} className="wind-range" type="range" min="0" max="100" step="5" value={state.wind}
              style={{'--range-fill':state.wind+'%'}} onChange={event=>setState(s=>({...s,wind:+event.target.value}))}/></label>
        </section>
        <footer><Info size={12}/>{t('Образователна симулация · Потоците и часовите профили са приблизителни.')}</footer>
      </div>
    </main>
    <Chat key={user?.id||'guest'} state={state} setState={setState} collapsed={chatCollapsed} setCollapsed={setChatCollapsed}/>
  </div>;
}
