const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_ORIGIN||'http://127.0.0.1:8769/',output=process.env.TEST_OUTPUT||'.';
const ua=devices['iPhone 13'].userAgent+' MicroMessenger/8.0.60';
async function ready(p){
 await p.evaluate(()=>{
  window.entryBarriers={};for(const [key,promise] of [['assistant',window.TimeviewAssistantReady],['views',window.TimeviewViews?.ready]])Promise.resolve(promise).then(()=>entryBarriers[key]='ready',e=>entryBarriers[key]=e.message);
 });
 try{await p.waitForFunction(()=>window.TimeviewPreload?.ready||document.getElementById('introOverlay')?.dataset.phase==='error',null,{timeout:15000,polling:100});}catch(error){console.log('ENTRY DIAGNOSTIC',await p.evaluate(()=>({barriers:window.entryBarriers,hidden:document.hidden,frames:window.frameProbe,images:window.imageProbe,phase:document.getElementById('introOverlay')?.dataset.phase,note:document.getElementById('introNote')?.textContent,percent:document.getElementById('introPercent')?.textContent,media:window.TimeviewPreload?.media})));throw error;}
 assert(await p.evaluate(()=>TimeviewPreload.ready),await p.locator('#introNote').textContent());
}
async function playing(p){await p.waitForFunction(()=>document.getElementById('introVid').currentTime>.2,null,{timeout:15000,polling:100});}
async function state(p){return p.evaluate(()=>({media:TimeviewPreload.media,phase:document.getElementById('introOverlay').dataset.phase,calls:window.mediaCalls,src:document.getElementById('introVid').currentSrc,muted:document.getElementById('introVid').muted}));}
(async()=>{
 const results=[];
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const b=await engine.launch();try{
   const c=await b.newContext({...devices['iPhone 13'],userAgent:ua,serviceWorkers:'block'});
   await c.addInitScript(legacy=>{
    window.frameProbe={scheduled:0,finished:0};const raf=requestAnimationFrame;
    window.requestAnimationFrame=fn=>{frameProbe.scheduled++;return raf.call(window,t=>{frameProbe.finished++;fn(t);});};
    window.imageProbe=[];const decode=HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode=function(){const record={src:this.src,state:'decoding'};imageProbe.push(record);return decode.call(this).then(value=>{record.state='ready';return value;},error=>{record.state=error.message;throw error;});};
    localStorage.setItem('guideSeen','1');
    for(let proto=navigator;proto;proto=Object.getPrototypeOf(proto))delete proto.serviceWorker;
    // Model an embedded browser that exposes CacheStorage but disallows it.
    Object.defineProperty(window,'caches',{configurable:true,value:{open:()=>Promise.reject(new DOMException('Unavailable','SecurityError'))}});
    window.mediaCalls={load:0,play:0,gesture:0};let tapped=false;
    document.addEventListener('click',e=>{if(e.target.id==='introRetry')tapped=true;},true);
    const load=HTMLMediaElement.prototype.load,play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.load=function(){if(this.id==='introVid'&&this.hasAttribute('src')){mediaCalls.load++;if(!tapped)throw Error('Load before WeChat tap');}return load.call(this);};
    HTMLMediaElement.prototype.play=function(){if(this.id==='introVid'){mediaCalls.play++;if(!tapped)return Promise.reject(new DOMException('Tap required','NotAllowedError'));mediaCalls.gesture++;}const promise=play.call(this);return legacy?undefined:promise;};
   },name==='chromium');
   const p=await c.newPage(),errors=[];p.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',name,e.message);});
   for(const city of ['beijing','shanghai']){
    const at=Date.now();await p.goto(base+'?intro='+city);await ready(p);assert(Date.now()-at>=4900);
    const before=await state(p);assert.equal(before.phase,'awaiting-play');assert.equal(before.media.transport,'http');assert.equal(before.calls.load,0);assert.equal(before.calls.play,0);
    assert(await p.locator('#introRetry').isVisible());assert(await p.locator('#introSkip').isEnabled());
    await p.screenshot({path:path.join(output,`v426-${name}-${city}-entry.png`)});
    await p.locator('#introRetry').tap();await playing(p);const after=await state(p);assert.equal(after.muted,false);assert(after.calls.gesture>0);assert(after.src.startsWith('http'));
    await p.locator('#introSkip').tap();await p.waitForFunction(()=>!introActive);assert.equal(await p.evaluate(()=>TIMEVIEW),'earth');results.push({name,city,before,after});
   }
   assert.deepEqual(errors,[]);await c.close();console.log('PASS WeChat gesture without storage/worker',name);
  }finally{await b.close();}
 }
 const b=await chromium.launch();try{
  const c=await b.newContext({...devices['iPhone 13'],userAgent:ua,serviceWorkers:'block'});
  await c.addInitScript(()=>{
   localStorage.setItem('guideSeen','1');window.blockPlayback=true;
   const play=HTMLMediaElement.prototype.play;
   HTMLMediaElement.prototype.play=function(){if(this.id==='introVid'&&blockPlayback==='throw')throw new DOMException('Decoder failed','NotSupportedError');if(this.id==='introVid'&&blockPlayback)return new Promise(()=>{});return play.call(this);};
  });
  const p=await c.newPage();await p.goto(base);await ready(p);await p.locator('#introRetry').tap();
  await p.waitForFunction(()=>document.getElementById('introOverlay').dataset.phase==='awaiting-play',null,{timeout:15000,polling:100});
  assert(await p.locator('#introRetry').isVisible());assert.equal(await p.evaluate(()=>introActive),true,'timeout must not skip the video');
  await p.evaluate(()=>{blockPlayback='throw';});await p.locator('#introRetry').tap();
  await p.waitForFunction(()=>document.getElementById('introOverlay').dataset.phase==='video-error');
  await p.evaluate(()=>{blockPlayback=false;});await p.locator('#introRetry').tap();await playing(p);
  await p.locator('#introSkip').tap();await p.waitForFunction(()=>!introActive);
  assert.equal(await p.evaluate(()=>TIMEVIEW),'earth');console.log('PASS pending play returns to tap and retry works');
  await c.close();
 }finally{await b.close();}
 fs.writeFileSync(path.join(output,'v426-wechat-results.json'),JSON.stringify(results,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
