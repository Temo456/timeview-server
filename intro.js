/* One entry journey, with an explicit choice when the user reopens the intro. */
(function(){
  'use strict';
  const overlay=document.getElementById('introOverlay'),video=document.getElementById('introVid'),loading=document.getElementById('introLoading');
  const scope=new URL('./',document.baseURI),params=new URLSearchParams(location.search);
  const completedKey='timeview:intro:4.1.0:'+scope.pathname,cityKey='timeview:intro-city:'+scope.pathname;
  const cities={
    beijing:{name:'北京',place:'天安门',poster:'textures/intro-beijing-v421-poster.jpg',desktop:['textures/intro-beijing-v421.mp4',4490766],mobile:['textures/intro-beijing-v421-mobile.mp4',1838271]},
    shanghai:{name:'上海',place:'迪士尼',poster:'textures/intro-shanghai-v420-poster.jpg',desktop:['textures/intro-shanghai-v420.mp4',2594365],mobile:['textures/intro-shanghai-v420-mobile.mp4',1687342]}
  };
  let savedCity,completed=false;
  try{savedCity=localStorage.getItem(cityKey);completed=sessionStorage.getItem(completedKey)==='1';}catch(_){}
  const cityId=Object.hasOwn(cities,params.get('intro'))?params.get('intro'):Object.hasOwn(cities,savedCity)?savedCity:'beijing';
  const city=cities[cityId],isFlight=cityId==='beijing';
  video.dataset.city=cityId;video.dataset.src=city.desktop[0];video.dataset.mobileSrc=city.mobile[0];
  const credits=document.createElement('div');credits.id='introCredits';credits.hidden=!isFlight;
  credits.textContent='影像：NASA · EOX/Copernicus 2016（CC BY 4.0）\n道路：© OpenStreetMap contributors · 天安门近景为动画重建';
  overlay.append(credits);
  const sound=document.createElement('button');sound.id='introSound';sound.type='button';sound.hidden=true;sound.textContent='开启声音';overlay.append(sound);
  let closing=false,hasStarted=false,playRequest=0,frameHandle=null,lastScale=NaN,resumeWhenVisible=false;
  window.introActive=false;window.introTransitioning=false;
  function alignArrival(){
    if(!isFlight||!video.videoHeight)return;
    const fit=Math.min(innerWidth/video.videoWidth,innerHeight/video.videoHeight),target=Math.min(innerWidth,innerHeight)/(fit*video.videoHeight);
    const end=Number.isFinite(video.duration)?video.duration:15,p=Math.max(0,Math.min(1,(video.currentTime-(end-2.25))/1.9)),ease=p*p*(3-2*p),scale=1+(target-1)*ease;
    if(!Number.isFinite(lastScale)||Math.abs(scale-lastScale)>.0001){video.style.transform=`scale(${scale})`;lastScale=scale;}
  }
  function trackArrival(){
    alignArrival();
    if(video.requestVideoFrameCallback&&!closing&&!video.paused&&frameHandle===null&&video.currentTime>=video.duration-2.25){
      frameHandle=video.requestVideoFrameCallback(()=>{frameHandle=null;trackArrival();});
    }
  }
  video.addEventListener('timeupdate',trackArrival);addEventListener('resize',alignArrival);
  function finish(recordCompletion){
    if(!window.introActive||closing||!window.TimeviewPreload.ready)return;
    if(recordCompletion){try{sessionStorage.setItem(completedKey,'1');}catch(_){}}
    closing=true;resumeWhenVisible=false;window.introTransitioning=true;++playRequest;video.pause();sound.hidden=true;overlay.style.opacity='0';overlay.dataset.phase='complete';
    if(frameHandle!==null){video.cancelVideoFrameCallback(frameHandle);frameHandle=null;}
    setTimeout(()=>{
      overlay.style.display='none';overlay.style.opacity='1';video.style.visibility='hidden';window.introActive=false;window.introTransitioning=false;window.introArrivalLock=false;
      window.dispatchEvent(new Event('timeview:intro-finished'));
    },800);
  }
  function playWithSound(){
    if(closing||!window.TimeviewPreload.ready)return;
    if(document.hidden){resumeWhenVisible=true;return;}
    const request=++playRequest,current=()=>request===playRequest&&!closing;
    sound.classList.remove('intro-start-button');video.muted=false;video.volume=1;
    video.play().then(()=>{if(current())sound.hidden=true;}).catch(error=>{
      if(!current())return;
      if(error.name!=='NotAllowedError'){loading.style.display='grid';window.TimeviewPreload.fail(new Error('开场播放失败，请重新加载。'));return;}
      sound.textContent='开启声音';sound.hidden=false;video.muted=true;
      video.play().catch(()=>{if(current()){sound.textContent='点击播放（有声）';sound.classList.add('intro-start-button');}});
    });
  }
  async function start(playMovie){
    window.introActive=true;window.introTransitioning=false;window.introArrivalLock=isFlight&&playMovie;
    overlay.style.display='block';overlay.dataset.phase='loading';document.getElementById('introSkip').disabled=true;video.pause();video.defaultMuted=false;video.removeAttribute('muted');
    const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<=768||connection&&(connection.saveData||/^(slow-)?2g$/.test(connection.effectiveType)||connection.downlink>0&&connection.downlink<3);
    const movies=Object.values(cities).map(item=>{const [url,bytes]=item[mobile?'mobile':'desktop'];return {url,bytes,label:item.name+'开场'};});
    const source=city[mobile?'mobile':'desktop'][0];
    try{
      await window.TimeviewPreload.prepare(video,source,playMovie,movies);
      if(!playMovie){finish(false);return;}
      video.currentTime=0;video.style.visibility='visible';loading.style.display='none';overlay.dataset.phase='playing';document.getElementById('introSkip').disabled=false;
      playWithSound();
    }catch(error){window.TimeviewPreload.fail(error);}
  }
  sound.addEventListener('click',playWithSound);
  video.addEventListener('playing',()=>{
    if(document.hidden){resumeWhenVisible=true;video.pause();return;}
    if(window.introActive&&!closing&&!video.seeking&&!video.paused){hasStarted=true;video.style.visibility='visible';loading.style.display='none';}
    trackArrival();
  });
  video.addEventListener('ended',()=>{if(hasStarted&&overlay.dataset.phase==='playing'&&video.currentTime>=video.duration-.1)finish(true);});
  video.addEventListener('error',()=>{if(overlay.dataset.phase==='playing'){loading.style.display='grid';window.TimeviewPreload.fail(new Error('开场播放失败，请重新加载。'));}});
  document.getElementById('introSkip').addEventListener('click',()=>finish(true));
  document.addEventListener('visibilitychange',()=>{
    if(closing||overlay.dataset.phase!=='playing')return;
    if(document.hidden){if(!video.paused){resumeWhenVisible=true;video.pause();}}
    else if(resumeWhenVisible){resumeWhenVisible=false;playWithSound();}
  });

  const chooser=document.createElement('dialog');chooser.id='introChooser';chooser.setAttribute('aria-labelledby','introChoiceTitle');
  chooser.innerHTML=`<div class="intro-choice-heading"><div><p>TIMEVIEW · 开场旅程</p><h2 id="introChoiceTitle">从哪座城市出发</h2></div><button type="button" class="intro-choice-close" aria-label="取消选择">×</button></div><div class="intro-city-grid">${Object.entries(cities).map(([id,item])=>`<button type="button" class="intro-city" data-city="${id}"><img data-src="${item.poster}" alt="${item.place}上空"><span class="intro-city-caption"><strong>${item.name}</strong><span>${item.place} → 地球</span><small>15 秒 · 有声开场</small></span></button>`).join('')}</div><p class="intro-choice-note">选择后从开场重新出发</p>`;
  document.body.append(chooser);let restarting=false;
  ['pointerdown','pointermove','pointerup','mousedown','touchstart','touchmove','wheel','click'].forEach(type=>chooser.addEventListener(type,event=>event.stopPropagation(),{passive:true}));
  chooser.querySelector('.intro-choice-close').onclick=()=>chooser.close();
  chooser.addEventListener('click',event=>{if(event.target===chooser){const rect=chooser.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)chooser.close();}});
  chooser.addEventListener('close',()=>window.dispatchEvent(new CustomEvent('timeview:intro-choice-closed',{detail:{restarting}})));
  chooser.querySelectorAll('[data-city]').forEach(button=>button.onclick=()=>{
    restarting=true;const selected=button.dataset.city;
    window.courseRestarting=true;window.dispatchEvent(new Event('timeview:course-restart'));
    try{
      localStorage.setItem(cityKey,selected);sessionStorage.removeItem(completedKey);sessionStorage.setItem('tv-clock-paused','0');
      sessionStorage.setItem('tv-course-v2-'+(window.TimeviewActiveCourseId||'cosmos-basics'),JSON.stringify({cursor:0,muted:false,closed:true,resume:false}));
    }catch(_){}
    const target=new URL(scope),query=new URLSearchParams({restart:'1',intro:selected});
    if(params.get('preview')==='1'&&params.get('course')){query.set('preview','1');query.set('course',params.get('course'));}
    if(document.body.classList.contains('scrsv')||params.get('scrsv')==='1')query.set('scrsv','1');
    target.search=query;chooser.close();location.assign(target.href);
  });
  window.replayIntro=function(){
    if(chooser.open)return;restarting=false;
    chooser.querySelectorAll('img').forEach(img=>{if(!img.src)window.TimeviewPreload.image(img,img.dataset.src).catch(()=>{});});
    chooser.showModal();window.dispatchEvent(new Event('timeview:intro-choice-opened'));
  };
  const rootEntry=location.pathname.replace(/\/$/,'')===scope.pathname.replace(/\/$/,''),playMovie=rootEntry||params.get('restart')==='1'||params.has('intro')||!completed;
  window.TimeviewEntryFresh=rootEntry||params.get('restart')==='1';
  if(window.TimeviewEntryFresh){try{sessionStorage.setItem('tv-clock-paused','0');}catch(_){}}
  if(overlay.dataset.view==='solar'&&playMovie){
    window.introActive=true;window.introRedirecting=true;
    const query=new URLSearchParams({restart:'1',intro:cityId});
    if(params.get('scrsv')==='1')query.set('scrsv','1');
    if(params.get('preview')==='1'&&params.get('course')){query.set('preview','1');query.set('course',params.get('course'));}
    const target=new URL(scope);target.search=query;location.replace(target.href);
  }else start(playMovie);
})();
