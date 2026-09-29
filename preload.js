/* Prepare the complete opening and decoded Earth scene before revealing either. */
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
    ['textures/intro-shanghai-v420-poster.jpg',36758,'上海开场画面'],
    ...[['sun.jpg',108866],['mercury.jpg',107360],['venus.jpg',104849],['earth.jpg',64056],['mars.jpg',84864],['jupiter.jpg',67818],['saturn.jpg',27571],['saturn_ring.png',5506],['uranus.jpg',7711],['neptune.jpg',14591],['pluto.jpg',143826]].map(([file,size])=>['textures/'+file,size,'行星画面'])
  ];
  const threeURL='vendor/three-0.160.0.module.min.js';
  let active = false, ready = false, manifestReady = false, movie = null, renderPending = false, audioStatus=null;
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
    const percent = ready ? 100 : !manifestReady ? 0 : Math.min(99, Math.floor(100 * loaded / Math.max(1, total)));
    document.getElementById('introPercent').textContent = percent;
    const bar = document.getElementById('introProgress');
    bar.setAttribute('aria-valuenow', percent);
    bar.firstElementChild.style.width = percent + '%';
    if(document.getElementById('introOverlay').dataset.phase!=='error')document.getElementById('introStage').textContent = ready ? '准备完成，即将出发' : audioStatus&&audioStatus.state!=='ready' ? '课程音频正在生成 · '+audioStatus.done+'/'+audioStatus.total : !manifestReady ? '正在获取课程资源' : loaded >= total ? '正在准备画面' : '正在加载旅程资源';
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
      <p class="intro-subtitle">从一座城，走进地球的时间</p>
      <div class="intro-progress-heading"><span id="introStage">正在加载旅程资源</span><span class="intro-percent"><span id="introPercent">0</span><small>%</small></span></div>
      <div id="introProgress" class="intro-progress" role="progressbar" aria-label="资源加载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
      <p id="introNote" class="intro-note" role="status" aria-live="polite">准备好整段旅程，再一起出发</p>
      <button id="introRetry" class="intro-retry" type="button" hidden>重新加载</button>
    </section>`;
    document.getElementById('introRetry').addEventListener('click', () => location.reload());
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
      if (!response.ok || !/^(image\/|video\/|(?:text|application)\/javascript)/.test(response.headers.get('content-type') || '')) throw new Error('Invalid resource');
      const length = Number(response.headers.get('content-length'));
      if (length > 0) item.total = length;
      const chunks = [], reader = response.body && response.body.getReader();
      if (reader) {
        while (true) {
          arm(); const {done, value} = await reader.read(); if (done) break;
          chunks.push(value); item.loaded += value.byteLength;
          if (item.loaded > item.total) item.total = item.loaded;
          update();
        }
      } else { const bytes = await response.arrayBuffer(); chunks.push(bytes); item.loaded = bytes.byteLength; }
      clearTimeout(timer);
      const blob = new Blob(chunks, {type:response.headers.get('content-type')});
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
    if (!item.promise) item.promise = download(item).catch(() => download(item));
    return item.promise;
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
      try { await decode(img, await asset(url)); }
      catch (error) {
        await forget(url);
        if (!fallback) throw new Error(item.label + '未能准备好，请重新加载。');
        item.ignored = true;
        const alternate = record(fallback, item.total, item.label, item.group);
        await decode(img, await asset(fallback)); item = alternate;
      }
      item.decoded = true; update(); return img;
    })();
    images.set(img, {url, promise});
    // Image requests can start before the document's ready barrier is installed.
    promise.catch(() => {});
    return promise;
  }
  async function prepareVideo(video, source) {
    const item = resources.get(absolute(source));
    const url = await asset(source);
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('Decode timeout')), 20000);
        function finish(error) { clearTimeout(timer); video.removeEventListener('loadeddata', loaded); video.removeEventListener('error', failed); error ? reject(error) : resolve(); }
        const loaded = () => finish(), failed = () => finish(new Error('Video decode failed'));
        video.addEventListener('loadeddata', loaded); video.addEventListener('error', failed);
        video.preload = 'auto'; video.src = url; video.load();
      });
      item.decoded = true; update();
    } catch (error) { await forget(source); throw new Error('开场动画未能准备好，请重新加载。'); }
  }
  async function prepare(video, source, playMovie, movies=[]) {
    specs.forEach(([url,size,label]) => record(url,size,label));
    record(threeURL,670681,'太阳系画面');
    movies.forEach(item=>record(item.url,item.bytes,item.label,'movie'));
    if (playMovie) movie = source;
    show();
    const pictureWork = specs.map(([url]) => image(new Image(), url, url.endsWith('.webp') ? url.replace('.webp','.png') : null));
    const audioWork=window.TimeviewAudio.prepare({
      register(entries){entries.forEach(e=>record(e.url,e.bytes,'朗读音频','audio'));manifestReady=true;update();},
      progress(url,loaded,total){const item=record(url,total,'朗读音频','audio');item.loaded=loaded;item.total=total;item.decoded=loaded===total;update();}
    });
    const appWork = (async () => {
      if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once:true}));
      if (!window.TimeviewAssistantReady || !window.TimeviewCards || !window.TimeviewCourseVisuals) throw new Error('界面未能初始化，请重新加载。');
      await window.TimeviewAssistantReady;
      if(document.getElementById('introOverlay').dataset.view==='solar')await sceneReady;
      else{if(typeof window.prepareEarthScene!=='function')throw Error('地球界面未能初始化，请重新加载。');await window.prepareEarthScene();}
      update();
    })();
    await Promise.all([...pictureWork, appWork, audioWork, asset(threeURL), ...movies.map(item=>asset(item.url)), playMovie ? prepareVideo(video, source) : Promise.resolve()]);
    ready = true; render();
    window.dispatchEvent(new Event('timeview:resources-ready'));
  }
  function fail(error) {
    document.getElementById('introOverlay').dataset.phase = 'error';
    document.getElementById('introStage').textContent = '暂时未能完成准备';
    const note = document.getElementById('introNote');
    note.textContent = error.message || '加载遇到问题，请检查网络后重试。';
    const retry = document.getElementById('introRetry'); retry.hidden = false; retry.focus();
  }
  addEventListener('pagehide', event => {
    if (event.persisted) return;
    resources.forEach(item => item.controller && item.controller.abort());
    objectURLs.forEach(url => URL.revokeObjectURL(url));
  });
  window.addEventListener('timeview:audio-status',event=>{audioStatus=event.detail;update();});
  window.TimeviewPreload = {prepare, image, fail, sceneReady:sceneResolve, sceneFailed:sceneReject, three:()=>asset(threeURL).then(url=>import(url)), get ready() { return ready; }};
})();
