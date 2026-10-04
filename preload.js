/* Cache the journey, decode its active scene, then reveal it after at least 5s. */
(function () {
  'use strict';
  const resources = new Map(), images = new WeakMap(), objectURLs = new Set();
  const scope = new URL('./', document.baseURI).href;
  const cachePrefix = 'timeview-preload:' + scope + ':';
  // The existing unversioned image/engine assets are unchanged in 4.1.0.
  const cacheName = cachePrefix + '4.0.19';
  const specs = [
    ['textures/earth-north-pole.webp', 885336, '地球北半球'],
    ['textures/earth-south-pole.webp', 140252, '地球南半球'],
    ['textures/moon.jpg', 206902, '月球'],
    ['textures/change-orbiter.svg?v=3.57', 496, '嫦娥卫星'],
    ['textures/intro-beijing-v421-poster.jpg',42005,'北京开场画面'],
    ['textures/intro-shanghai-v4213-poster.jpg',51296,'上海开场画面'],
    ...[['sun.jpg',108866],['mercury.jpg',107360],['venus.jpg',104849],['earth.jpg',64056],['mars.jpg',84864],['jupiter.jpg',67818],['saturn.jpg',27571],['saturn_ring.png',5506],['uranus.jpg',7711],['neptune.jpg',14591],['pluto.jpg',143826]].map(([file,size])=>['textures/'+file,size,'行星画面'])
  ];
  const threeURL='vendor/three-0.160.0.module.min.js';
  const minimumLoadingMs = 5000;
  // Includes iPadOS using the desktop Safari user agent.
  const appleTouch = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const wechat = /MicroMessenger/i.test(navigator.userAgent);
  let active = false, ready = false, prepared = false, manifestReady = false, renderPending = false, audioStatus=null;
  let media=null;
  function limit(concurrency) {
    let running = 0; const queue = [];
    function next() {
      while (running < concurrency && queue.length) {
        const {work, resolve, reject} = queue.shift(); running++;
        Promise.resolve().then(work).then(resolve, reject).finally(() => { running--; next(); });
      }
    }
    return work => new Promise((resolve, reject) => { queue.push({work, resolve, reject}); next(); });
  }
  const transfer = limit(3), decodeImage = limit(2);
  let sceneResolve,sceneReject;
  const sceneReady=new Promise((resolve,reject)=>{sceneResolve=resolve;sceneReject=reject;});
  sceneReady.catch(()=>{});
  const absolute = url => new URL(url, document.baseURI).href;
  const cache = ('caches' in window ? caches.open(cacheName).then(async store => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(cachePrefix) && name !== cacheName).map(name => caches.delete(name)));
    return store;
  }) : Promise.resolve(null)).catch(() => null);

  function record(url, size = 1, label = '画面资源', group = 'earth') {
    const key = absolute(url);
    if (!resources.has(key)) resources.set(key, {url:key, total:size, loaded:0, label, group, decoded:false, ignored:false});
    return resources.get(key);
  }
  function render() {
    renderPending = false;
    if (!active) return;
    const entries = [...resources.values()].filter(r => !r.ignored);
    const total = entries.reduce((n, r) => n + r.total, 0);
    const loaded = entries.reduce((n, r) => n + Math.min(r.loaded, r.total), 0);
    const percent = prepared ? 100 : !manifestReady ? 0 : Math.min(99, Math.floor(100 * loaded / Math.max(1, total)));
    document.getElementById('introPercent').textContent = percent;
    const bar = document.getElementById('introProgress');
    bar.setAttribute('aria-valuenow', percent);
    bar.firstElementChild.style.width = percent + '%';
    if(document.getElementById('introOverlay').dataset.phase==='loading')document.getElementById('introStage').textContent = prepared ? '准备完成，即将出发' : audioStatus&&audioStatus.state!=='ready' ? '课程音频正在生成 · '+audioStatus.done+'/'+audioStatus.total : !manifestReady ? '正在获取课程资源' : loaded >= total ? '正在准备画面' : '正在加载旅程资源';
  }
  function update() {
    if (!renderPending && active) { renderPending = true; requestAnimationFrame(render); }
  }
  function show() {
    active = true;
    const el = document.getElementById('introLoading');
    el.removeAttribute('style'); el.removeAttribute('role'); el.className = 'intro-loading';
    el.innerHTML = `<section class="intro-prep" aria-label="准备时间景观">
      <p class="intro-kicker">TIMEVIEW · FROM CITY TO EARTH</p><h1 class="intro-title">时间景观</h1>
      <p class="intro-subtitle">观乎天文，以察时变</p>
      <div class="intro-progress-heading"><span id="introStage">正在加载旅程资源</span><span class="intro-percent"><span id="introPercent">0</span><small>%</small></span></div>
      <div id="introProgress" class="intro-progress" role="progressbar" aria-label="资源加载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
      <p id="introNote" class="intro-note" role="status" aria-live="polite">你的城 你的生日星空</p>
      <button id="introRetry" class="intro-retry" type="button" hidden>重新加载</button>
    </section>`;
    document.getElementById('introRetry').onclick=() => location.reload();
    render();
  }
  async function forget(url) {
    const store = await cache;
    if (store) await store.delete(absolute(url)).catch(() => {});
  }
  async function download(item) {
    const store = await cache;
    item.loaded = 0; item.decoded = false;
    const controller = new AbortController(); item.controller = controller;
    let timer;
    // Browser connection queues and large media can delay a small resource's
    // first bytes. Keep the timeout about a stalled transfer, not total load time.
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), 90000); };
    try {
      arm();
      let response = store && await store.match(item.url).catch(() => null);
      const cached = !!response;
      if (!response) response = await fetch(item.url, {signal:controller.signal});
      if (response.status!==200 || !/^(image\/|video\/|(?:text|application)\/javascript)/.test(response.headers.get('content-type') || '')) throw new Error('Invalid resource');
      const length = Number(response.headers.get('content-length'));
      if (length > 0) item.total = length;
      let blob;
      if (cached) {
        // CacheStorage already owns the bytes; avoid another JS chunk array.
        blob = await response.blob();
      } else {
        const chunks = [], reader = response.body && response.body.getReader();
        if (reader) {
          while (true) {
            arm(); const {done, value} = await reader.read(); if (done) break;
            chunks.push(value); item.loaded += value.byteLength;
            if (item.loaded > item.total) item.total = item.loaded;
            update();
          }
        } else { const bytes = await response.arrayBuffer(); chunks.push(bytes); item.loaded = bytes.byteLength; }
        blob = new Blob(chunks, {type:response.headers.get('content-type')});
        chunks.length = 0;
      }
      clearTimeout(timer);
      item.total = item.loaded = blob.size;
      if (!blob.size) throw new Error('Empty resource');
      if (store && !cached) await store.put(item.url, new Response(blob, {headers:{'Content-Type':blob.type, 'Content-Length':String(blob.size)}})).catch(() => {});
      const url = URL.createObjectURL(blob); objectURLs.add(url); item.objectURL = url;
      update(); return url;
    } catch (error) {
      await forget(item.url);
      throw new Error(item.label + '未能加载，请检查网络后重试。');
    } finally { clearTimeout(timer); item.controller = null; }
  }
  function asset(url) {
    const item = record(url);
    if (!item.promise) item.promise = transfer(() => download(item).catch(() => download(item))).catch(error=>{delete item.promise;throw error;});
    return item.promise;
  }
  function discard(item) {
    if(item.objectURL){URL.revokeObjectURL(item.objectURL);objectURLs.delete(item.objectURL);}
    delete item.objectURL;delete item.promise;item.loaded=0;item.decoded=false;
  }
  async function decode(img, url) {
    if (img.src !== url) img.src = url;
    if (img.decode) await img.decode();
    else if (!img.complete) await new Promise((resolve, reject) => { img.addEventListener('load', resolve, {once:true}); img.addEventListener('error', reject, {once:true}); });
    if (!img.naturalWidth) throw new Error('Image decode failed');
    return img;
  }
  function image(img, url, fallback) {
    const prior = images.get(img);
    if (prior && prior.url === url) return prior.promise;
    const promise = (async () => {
      let item = record(url);
      try { const source = await asset(url); await decodeImage(() => decode(img, source)); }
      catch (error) {
        await forget(url);
        discard(item);
        if (!fallback) throw new Error(item.label + '未能准备好，请重新加载。');
        item.ignored = true;
        const alternate = record(fallback, item.total, item.label, item.group);
        const source = await asset(fallback); await decodeImage(() => decode(img, source)); item = alternate;
      }
      item.decoded = true; update(); return img;
    })();
    images.set(img, {url, promise});
    // Image requests can start before the document's ready barrier is installed.
    promise.catch(() => {});
    return promise;
  }
  async function movieCacheAvailable(){
    if(!navigator.serviceWorker||typeof MessageChannel==='undefined')return false;
    return new Promise(resolve=>{
      const worker=navigator.serviceWorker;let done=false,ports=[];
      const timer=setTimeout(()=>finish(false),1500);
      function finish(value){if(done)return;done=true;clearTimeout(timer);worker.removeEventListener('controllerchange',check);ports.forEach(p=>p.close());resolve(value);}
      function check(){
        if(!worker.controller)return;
        const channel=new MessageChannel();ports.push(channel.port1);
        channel.port1.onmessage=e=>{if(e.data?.movieCache)finish(true);};
        try{worker.controller.postMessage({type:'timeview:movie-cache'},[channel.port2]);}catch(_){finish(false);}
      }
      worker.addEventListener('controllerchange',check);check();
    });
  }
  function configureMovie(video){
    video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
    video.muted=true;video.defaultMuted=true;video.style.visibility='visible';
  }
  function loadMovie(video,url){
    return new Promise((resolve,reject)=>{
      let timer,poll,done=false;
      const check=()=>{if(video.readyState>=1&&video.videoWidth>0)finish();};
      const failed=()=>finish(Object.assign(new Error('Media decode failed'),{mediaCode:video.error?.code||0}));
      function finish(error,gesture=false){
        if(done)return;done=true;clearTimeout(timer);clearTimeout(poll);
        for(const event of ['loadedmetadata','loadeddata','canplay'])video.removeEventListener(event,check);
        video.removeEventListener('error',failed);error?reject(error):resolve({needsGesture:gesture});
      }
      function inspect(){if(video.error){failed();return;}check();if(!done)poll=setTimeout(inspect,250);}
      for(const event of ['loadedmetadata','loadeddata','canplay'])video.addEventListener(event,check);
      video.addEventListener('error',failed);
      // A silent preload with a visible element (behind the loading sheet) is
      // accepted more widely than loading a hidden, unmuted video on iOS.
      configureMovie(video);video.preload='metadata';
      timer=setTimeout(()=>video.error?failed():finish(null,true),8000);
      try{video.src=url;video.load();inspect();}catch(error){finish(error);}
    });
  }
  async function prepareVideo(video, source) {
    const item=resources.get(absolute(source)),blobURL=await asset(source),cachedHTTP=wechat?false:await movieCacheAvailable();
    const direct=absolute(source),url=appleTouch||wechat||cachedHTTP?direct:blobURL;
    media={source,transport:url===direct?(cachedHTTP?'cached-http':'http'):'blob',environment:wechat?'wechat':'browser',state:'preparing',attempts:[]};
    // WeChat's host app can require a tap even for muted media. The file has
    // already joined the unified download/cache barrier; don't wait for its
    // decoder before offering that tap, or depend on a Service Worker here.
    if(wechat){
      configureMovie(video);video.preload='none';video.src=direct;
      media.state='waiting-for-gesture';return {needsGesture:true};
    }
    for(const next of url===direct?[direct]:[blobURL,direct]){
      try{
        const result=await loadMovie(video,next);
        media.transport=next===direct?(cachedHTTP?'cached-http':'http'):'blob';
        media.state=result.needsGesture?'waiting-for-gesture':'metadata-ready';
        item.decoded=!result.needsGesture;update();return result;
      }catch(error){media.attempts.push({transport:next===direct?'http':'blob',code:error.mediaCode||0,readyState:video.readyState,networkState:video.networkState});}
    }
    media.state='failed';
    // The file was fully downloaded. A media-policy/decoder failure must not
    // erase a valid cache or trap the prepared Earth behind an endless reload.
    return {videoError:true};
  }
  async function prepare(video, source, playMovie, movies=[]) {
    specs.forEach(([url,size,label]) => record(url,size,label));
    record(threeURL,670681,'太阳系画面');
    movies.forEach(item=>record(item.url,item.bytes,item.label,'movie'));
    show();
    const shownAt = performance.now();
    // Download every scene, but only decode images requested by the active one.
    // Eager Image instances here duplicated the Earth textures and decoded all
    // planetary textures while the video decoder was starting on iPhone.
    const pictureWork = specs.map(([url]) => asset(url));
    const audioWork=window.TimeviewAudio.prepare({
      register(entries){entries.forEach(e=>record(e.url,e.bytes,'朗读音频','audio'));manifestReady=true;update();},
      progress(url,loaded,total){const item=record(url,total,'朗读音频','audio');item.loaded=loaded;item.total=total;item.decoded=loaded===total;update();}
    });
    const appWork = (async () => {
      if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once:true}));
      if (!window.TimeviewAssistantReady || !window.TimeviewCards || !window.TimeviewCourseVisuals) throw new Error('界面未能初始化，请重新加载。');
      await window.TimeviewAssistantReady;
      if(window.TimeviewViews)await window.TimeviewViews.ready;
      else if(document.getElementById('introOverlay').dataset.view==='solar')await sceneReady;
      else{if(typeof window.prepareEarthScene!=='function')throw Error('地球界面未能初始化，请重新加载。');await window.prepareEarthScene();}
      update();
    })();
    await Promise.all([...pictureWork, appWork, audioWork, asset(threeURL), ...movies.map(item=>asset(item.url))]);
    const movie=playMovie?await prepareVideo(video, source):{};
    prepared = true; render();
    const remaining = minimumLoadingMs - (performance.now() - shownAt);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    ready = true; render();
    window.dispatchEvent(new Event('timeview:resources-ready'));
    return movie;
  }
  function fail(error) {
    document.getElementById('introOverlay').dataset.phase = 'error';
    document.getElementById('introStage').textContent = '暂时未能完成准备';
    const note = document.getElementById('introNote');
    note.textContent = error.message || '加载遇到问题，请检查网络后重试。';
    const retry = document.getElementById('introRetry'); retry.hidden = false; retry.focus();
  }
  function releaseMovies() {
    resources.forEach(item => {
      if (item.group !== 'movie' || !item.objectURL) return;
      URL.revokeObjectURL(item.objectURL); objectURLs.delete(item.objectURL);
      delete item.objectURL; delete item.promise;
    });
  }
  addEventListener('pagehide', event => {
    if (event.persisted) return;
    resources.forEach(item => item.controller && item.controller.abort());
    objectURLs.forEach(url => URL.revokeObjectURL(url));
  });
  window.addEventListener('timeview:audio-status',event=>{audioStatus=event.detail;update();});
  window.TimeviewPreload = {prepare, image, fail, releaseMovies, sceneReady:sceneResolve, sceneFailed:sceneReject, three:()=>asset(threeURL).then(url=>import(url)),
    mediaFailure(video){if(media){media.state='failed';media.attempts.push({transport:media.transport,code:video.error?.code||0,readyState:video.readyState,networkState:video.networkState});}},
    get media(){return media?JSON.parse(JSON.stringify(media)):null;},get ready() { return ready; }};
})();
