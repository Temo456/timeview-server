/* One document, one narrator; scene roots and animation loops have explicit owners. */
(function () {
  'use strict';
  const host=document.getElementById('viewHost'),status=document.getElementById('viewStatus');
  const scenes=new Map(),pending=new Map();
  let active='earth',current=null,requestId=0,motion=null,lastTransition=null;
  let viewport={width:innerWidth,height:innerHeight};
  const initialView=readView();
  function readView(){
    const requested=new URLSearchParams(location.search).get('view');
    return requested==='solar'||(!requested&&location.pathname.endsWith('/solar-system.html'))?'solar':'earth';
  }
  function sceneDOM(root,name){
    const events=new AbortController(),cleanups=[];
    const shared=selector=>[...document.querySelectorAll(selector)].filter(el=>!el.closest('.view-root'));
    function listen(target,type,handler,options){
      const config=typeof options==='boolean'?{capture:options}:options||{};
      target.addEventListener(type,event=>{if(root.isConnected&&active===name)handler(event);},{...config,signal:events.signal});
    }
    return {
      getElementById:id=>root.querySelector('#'+CSS.escape(id))||shared('#'+CSS.escape(id))[0]||null,
      querySelector:selector=>root.querySelector(selector)||shared(selector)[0]||null,
      querySelectorAll:selector=>[...root.querySelectorAll(selector),...shared(selector)],
      onDocument:(...args)=>listen(document,...args),onWindow:(...args)=>listen(window,...args),
      onDispose:cleanup=>cleanups.push(cleanup),
      dispose(){events.abort();for(const cleanup of cleanups){try{cleanup();}catch(error){console.warn('Scene cleanup',error);}}}
    };
  }
  function ensure(name){
    if(scenes.has(name))return Promise.resolve(scenes.get(name));
    if(pending.has(name))return pending.get(name);
    const root=document.getElementById(name+'Template').content.firstElementChild.cloneNode(true);
    const dom=sceneDOM(root,name);
    // The initial controls are available immediately to shared mobile layout.
    if(!host.firstElementChild&&name==='earth')host.append(root);
    const promise=Promise.resolve().then(async()=>{
      try{
        const scene=await window.TimeviewSceneFactories[name](root,dom);
        scene.root=root;scene.dom=dom;
        if(scene.prepare)await scene.prepare();
        scenes.set(name,scene);return scene;
      }catch(error){dom.dispose();if(root.isConnected)root.remove();pending.delete(name);throw error;}
    });
    pending.set(name,promise);return promise;
  }
  function notice(text,error=false){
    status.textContent=text;status.hidden=!text;status.classList.toggle('error',error);
    host.setAttribute('aria-busy',String(!!text&&!error));
    for(const link of document.querySelectorAll('[data-view-target]'))link.setAttribute('aria-busy',String(!!text&&!error));
  }
  function closeSceneUI(){
    window.TimeviewMobile?.beforeViewChange();window.TimeviewCards?.hide();
    for(const id of ['datePicker','spdPopup','skinPopup','tzPopup','layerPopup','guideOverlay','guideCard']){
      const el=current?.root.querySelector('#'+id);if(el)el.style.display='none';
    }
  }
  function activate(name,scene,snapshot,{defer=false}={}){
    if(current){closeSceneUI();current.suspend();}
    active=name;current=scene;
    document.getElementById('earthViewStyle').media=name==='earth'?'all':'not all';
    document.getElementById('solarViewStyle').media=name==='solar'?'all':'not all';
    host.replaceChildren(scene.root);
    window.TIMEVIEW=name;window.TimeviewCourse=scene.course;
    if(snapshot){scene.restore(snapshot);try{sessionStorage.setItem('tv-clock-paused',snapshot.playing?'0':'1');}catch(_){}}
    document.title='时间景观 · '+(name==='earth'?'地球':'太阳系');
    document.body.dataset.view=name;
    window.dispatchEvent(new CustomEvent('timeview:view-changed',{detail:{view:name}}));
    if(!defer)scene.resume();
  }
  function urlFor(name){
    const url=new URL('app',document.baseURI);url.search=location.search;
    url.searchParams.set('view',name);
    if(current)url.searchParams.set('t',String(Math.round(current.snapshot().time)));
    // These are entry commands, not persistent view state.
    url.searchParams.delete('restart');url.searchParams.delete('intro');
    return url;
  }
  async function flightTo(name,scene,snapshot,from,writeHistory,duration=TimeviewTransition.duration){
    const rate={sec:1,hour:3600,day:86400,month:2592000,year:31557600}[snapshot.unit]||1;
    const cover=TimeviewTransition.cover(from);
    let finished=false,flight=null,to=null,resolve;
    const promise=new Promise(r=>{resolve=r});
    function complete(elapsed){
      if(finished)return;finished=true;
      if(motion===job)motion=null;
      try{
        if(snapshot.playing)scene.restore({...snapshot,time:snapshot.time+elapsed*rate});
        scene.drawStill();scene.resume();
      }finally{
        cover.dispose();if(!flight){from.dispose();to?.dispose();delete document.body.dataset.viewTransition;}
        resolve(true);
      }
    }
    const job={promise,finish(){if(flight)flight.finish();else complete(0);},
      get state(){return flight?.state||{from:active==='earth'?'solar':'earth',to:name,progress:0,phase:'preparing'};}};
    motion=job;document.body.dataset.viewTransition=name;
    activate(name,scene,snapshot,{defer:true});notice('');
    if(writeHistory)window.history.pushState({timeview:true,view:name},'',urlFor(name));
    try{
      // WebKit applies link media changes on its rendering boundary. Measuring
      // immediately can see an unstyled mobile toolbar and an offscreen Earth.
      window.TimeviewMobile?.refresh();
      await Promise.race([promise,new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))]);
      if(finished)return promise;
      scene.restore({...snapshot,time:snapshot.time+(snapshot.playing?duration*rate:0)});
      to=scene.transitionFrame({arriving:true});
      flight=TimeviewTransition.fly(from,to,{toward:name,onFinish:complete,duration});cover.dispose();
    }catch(error){complete(0);console.warn('View flight unavailable',error);}
    return promise;
  }
  async function switchTo(name,{source='manual',history:writeHistory=true,isCurrent=()=>true}={}){
    if(name!=='earth'&&name!=='solar')throw Error('未知视角');
    const token=++requestId;
    motion?.finish('superseded');
    if(source==='manual')window.dispatchEvent(new Event('timeview:manual-view'));
    await api.ready;
    if(token!==requestId||!isCurrent())return false;
    if(current&&active===name){notice('');return true;}
    if(!scenes.has(name))notice('正在准备'+(name==='solar'?'太阳系':'地球')+'视角…');
    try{
      const scene=await ensure(name);
      if(token!==requestId||!isCurrent()){if(token===requestId)notice('');return false;}
      const report={from:active,to:name,phases:[],resizes:[],interrupted:null,frames:0};
      lastTransition=report;
      let animate=window.TimeviewTransition&&!window.introActive&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(!animate)report.interrupted=document.hidden?'hidden':matchMedia('(prefers-reduced-motion: reduce)').matches?'reduced-motion':'intro-or-unavailable';
      let zoomed=false;
      if(animate&&name==='earth'&&current.prepareTransitionExit){
        const abort=new AbortController();
        const locating={finish:(reason='cancelled')=>{report.interrupted=reason;abort.abort();},state:{from:active,to:name,progress:0,phase:'locating-earth'}};
        motion=locating;
        try{zoomed=await current.prepareTransitionExit({signal:abort.signal,isCurrent:()=>token===requestId&&isCurrent(),target:()=>scene.transitionTarget(),
          onPhase:phase=>{locating.state.phase=phase;report.phases.push(phase);},onProgress:value=>{locating.state.progress=value;report.frames++;}});}
        finally{if(motion===locating)motion=null;}
        if(token!==requestId||!isCurrent())return false;
        animate=animate&&!abort.signal.aborted&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
      }
      const snapshot=current.snapshot();
      let from=null;
      if(animate){
        try{from=current.transitionFrame();}catch(error){console.warn('View flight snapshot unavailable',error);}
      }
      if(from){
        report.phases.push('blending');
        await flightTo(name,scene,snapshot,from,writeHistory,zoomed?TimeviewTransition.returnDuration:TimeviewTransition.duration);
      }else{
        activate(name,scene,snapshot);notice('');
        if(writeHistory)window.history.pushState({timeview:true,view:name},'',urlFor(name));
      }
      return token===requestId&&isCurrent();
    }catch(error){
      if(token===requestId)notice('视角暂未准备好，请再次点击切换重试。',true);
      throw error;
    }
  }
  const api={switchTo,get active(){return active;},get transition(){return motion?.state||null;},
    get lastTransition(){return lastTransition?JSON.parse(JSON.stringify(lastTransition)):null;},
    // Read-only scene diagnostics for performance and state-transfer regression checks.
    inspect:()=>Object.fromEntries([...scenes].map(([name,scene])=>[name,{...scene.snapshot(),...scene.diagnostics()}]))};
  window.TimeviewViews=api;window.TIMEVIEW='earth';
  api.ready=(async()=>{
    const earth=await ensure('earth');activate('earth',earth);
    if(initialView==='solar')activate('solar',await ensure('solar'),earth.snapshot());
  })();
  api.ready.catch(error=>{notice('画面暂未准备好，请重新加载。',true);console.error(error);});
  document.addEventListener('click',event=>{
    const link=event.target.closest('[data-view-target]');
    if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();switchTo(link.dataset.viewTarget).catch(console.error);
  });
  addEventListener('popstate',()=>switchTo(readView(),{history:false}).catch(console.error));
  function finishMotion(reason){if(motion){if(lastTransition)lastTransition.interrupted=reason;motion.finish(reason);}}
  addEventListener('resize',()=>{
    const next={width:innerWidth,height:innerHeight};
    const sameWidth=Math.abs(next.width-viewport.width)<=1,sameHeight=Math.abs(next.height-viewport.height)<=1;
    const touchViewport=window.TimeviewMobile?.active()||(navigator.maxTouchPoints>0&&Math.max(next.width,viewport.width)<=1024);
    viewport=next;
    if(!motion)return;
    const keep=(sameWidth&&sameHeight)||(touchViewport&&sameWidth);
    if(lastTransition&&lastTransition.resizes.length<20)lastTransition.resizes.push({...next,kept:keep});
    // Mobile browser chrome can change the height or send duplicate resize
    // notifications during a tap. Those are not a request to skip the flight.
    if(!keep)finishMotion('viewport-width-or-desktop-resize');
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finishMotion('hidden');});
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{if(e.matches)finishMotion('reduced-motion');});
  // Keep navigation and lesson controls usable, but prevent changing a captured
  // camera/date underneath the flight. Latest navigation always wins.
  for(const type of ['pointerdown','mousedown','touchstart','wheel','click','keydown']){
    document.addEventListener(type,event=>{
      if(!motion||event.target.closest?.('[data-view-target],#tv-assist,#tv-fab'))return;
      if(type==='keydown'&&event.key==='Tab')return;
      if(event.cancelable)event.preventDefault();event.stopImmediatePropagation();
    },{capture:true,passive:false});
  }
})();
