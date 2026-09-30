const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const setup=process.env.TEST_SETUP_MODULE?require(process.env.TEST_SETUP_MODULE).setup:null;
const base=process.env.TEST_ORIGIN||'http://127.0.0.1:8767/',output=process.env.TEST_OUTPUT||'.';
async function loaded(p){try{await p.waitForFunction(()=>TimeviewPreload?.ready||document.getElementById('introOverlay').dataset.phase==='error',null,{timeout:60000,polling:100});assert(await p.evaluate(()=>TimeviewPreload.ready));}catch(error){console.log('ENTRY DIAGNOSTIC',await p.evaluate(()=>({phase:document.getElementById('introOverlay').dataset.phase,note:document.getElementById('introNote')?.textContent,stage:document.getElementById('introStage')?.textContent,media:TimeviewPreload.media,videoError:document.getElementById('introVid').error?.code,ready:document.getElementById('introVid').readyState})));throw error;}}
async function playing(p){await p.waitForFunction(()=>document.getElementById('introVid').currentTime>.3,null,{timeout:15000,polling:100});}
(async()=>{
 const results=[];
 for(const name of ['chromium','webkit']){
  if(process.env.TEST_BROWSER&&process.env.TEST_BROWSER!==name)continue;
  const b=await (name==='webkit'?webkit:chromium).launch();try{
   const c=await b.newContext({...devices['iPhone 13'],serviceWorkers:'allow'});if(setup)await setup(c);
   await c.addInitScript(()=>localStorage.setItem('guideSeen','1'));
   await c.addInitScript(()=>{
    // Model Safari rejecting the Blob URL media route, while HTTP still works.
    const src=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');
    Object.defineProperty(HTMLMediaElement.prototype,'src',{...src,set(value){if(this.id==='introVid'&&String(value).startsWith('blob:'))throw Error('iOS Blob media regression');return src.set.call(this,value);}});
   });
   const p=await c.newPage(),errors=[],mediaResponses=[];p.on('pageerror',e=>errors.push(e.message));
   p.on('response',r=>{if(/intro-.*\.mp4$/.test(r.url()))mediaResponses.push({url:r.url(),status:r.status(),worker:r.fromServiceWorker(),range:r.request().headers()['range']||null});});
   for(const city of ['beijing','shanghai']){
    await p.goto(base+'?intro='+city);await loaded(p);await playing(p);
    const state=await p.evaluate(()=>({media:TimeviewPreload.media,src:document.getElementById('introVid').currentSrc,muted:document.getElementById('introVid').muted,phase:document.getElementById('introOverlay').dataset.phase}));
    assert.equal(state.media.transport,'cached-http');assert(state.src.startsWith('http'));assert.equal(state.phase,'playing');
    await p.locator('#introSkip').tap();await p.waitForFunction(()=>!introActive);
    results.push({name,city,...state});
   }
   // Engines differ in whether native media requests are exposed to Playwright.
   // Verify the actual offline response and playback instead of requiring a
   // particular entry in the automation protocol's network log.
   const cached=await p.evaluate(async()=>{
    const url=new URL('textures/intro-beijing-v421-mobile.mp4',document.baseURI);const c=await caches.open('timeview-preload:'+new URL('./',document.baseURI).href+':4.0.19');return (await c.match(url))?.status;
   });assert.equal(cached,200);
   if(process.env.TEST_MEDIA_OFFLINE_CONTROL)await fetch(process.env.TEST_MEDIA_OFFLINE_CONTROL+'?enabled=1');else await c.setOffline(true);
   const offline=await p.evaluate(async()=>{
    const r=await fetch(new URL('textures/intro-beijing-v421-mobile.mp4',document.baseURI),{headers:{Range:'bytes=0-1'}});return {status:r.status,bytes:[...new Uint8Array(await r.arrayBuffer())],range:r.headers.get('Content-Range'),cache:r.headers.get('X-Timeview-Media-Cache')};
   });assert.equal(offline.status,206);assert.equal(offline.bytes.length,2);assert.equal(offline.cache,'hit');
   // Windows WebKit's native media loader was observed reaching the origin
   // even when fetch() uses this worker's cached Range response. Check native
   // offline playback in Chromium; iPhone requires separate hardware coverage.
   if(name==='chromium'){
    await p.evaluate(async()=>{
     document.getElementById('introOverlay').style.display='block';
     const v=document.getElementById('introVid');v.style.visibility='visible';v.muted=true;v.src=new URL('textures/intro-beijing-v421-mobile.mp4',document.baseURI).href;v.load();await v.play();
    });await playing(p);
   }
   if(process.env.TEST_MEDIA_OFFLINE_CONTROL)await fetch(process.env.TEST_MEDIA_OFFLINE_CONTROL+'?enabled=0');else await c.setOffline(false);
   assert.deepEqual(errors,[]);console.log('PASS cached HTTP intro',name);await c.close();
  }finally{await b.close()}
 }
 // Metadata gated by user activation must offer a real tap, not an error/reload.
 const b=await chromium.launch();try{
  for(const mode of ['gesture','unsupported']){
   const c=await b.newContext({...devices['iPhone 13'],serviceWorkers:'allow'});if(setup)await setup(c);
   await c.addInitScript(()=>localStorage.setItem('guideSeen','1'));
   await c.addInitScript(mode=>{
    const load=HTMLMediaElement.prototype.load,play=HTMLMediaElement.prototype.play;
    window.mediaGate=true;
    HTMLMediaElement.prototype.load=function(){
     if(this.id==='introVid'&&window.mediaGate){
      if(mode==='unsupported'){Object.defineProperty(this,'error',{configurable:true,value:{code:4}});queueMicrotask(()=>this.dispatchEvent(new Event('error')));}
      return;
     }
     return load.call(this);
    };
    document.addEventListener('click',e=>{if(e.target.id==='introRetry'){window.mediaGate=false;delete document.getElementById('introVid').error;}},true);
    HTMLMediaElement.prototype.play=function(){if(this.id==='introVid'&&window.mediaGate)return Promise.reject(new DOMException('Activation required','NotAllowedError'));return play.call(this);};
    const src=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');let pending;
    Object.defineProperty(HTMLMediaElement.prototype,'src',{...src,set(value){if(this.id==='introVid'&&window.mediaGate){pending=value;return;}return src.set.call(this,value);}});
    document.addEventListener('click',e=>{if(e.target.id==='introRetry'&&pending){src.set.call(document.getElementById('introVid'),pending);pending=null;}},true);
   },mode);
   const p=await c.newPage();await p.goto(base+'?intro=beijing');await loaded(p);
   assert.equal(await p.locator('#introOverlay').getAttribute('data-phase'),mode==='gesture'?'awaiting-play':'video-error');
   assert(await p.locator('#introRetry').isVisible());assert(await p.locator('#introSkip').isEnabled());
   await p.screenshot({path:path.join(output,`v425-${mode}-entry.png`)});
   await p.locator('#introRetry').tap();await playing(p);
   assert.equal(await p.evaluate(()=>document.getElementById('introVid').muted),false,'tap starts with sound');
   await p.locator('#introSkip').tap();await p.waitForFunction(()=>!introActive);
   assert.equal(await p.evaluate(()=>TIMEVIEW),'earth');console.log('PASS intro recovery',mode);await c.close();
  }
 }finally{await b.close()}
 fs.writeFileSync(path.join(output,'v425-intro-results.json'),JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
