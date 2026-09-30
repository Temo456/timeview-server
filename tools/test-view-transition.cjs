/* Real-browser checks: projected landing, timing, cancellation, resize and
 * reduced motion. Uses the same optional fixtures as test-unified-views.cjs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const setup=process.env.TEST_SETUP_MODULE?require(process.env.TEST_SETUP_MODULE).setup:null;
const base=process.env.TEST_ORIGIN||'http://127.0.0.1:8767/',output=process.env.TEST_OUTPUT||'.';
const results=[];
function close(a,b){for(const key of ['x','y','r'])assert(Math.abs(a[key]-b[key])<.8,`${key}: ${a[key]} / ${b[key]}`)}
async function begin(p,view){
 await p.evaluate(view=>{window.flightDone=TimeviewViews.switchTo(view)},view);
 await p.waitForFunction(()=>TimeviewViews.transition?.progress>.1,null,{polling:10});
}
async function landed(p,view){
 await p.evaluate(()=>window.flightDone);
 const state=await p.evaluate(()=>({active:TIMEVIEW,motion:TimeviewViews.transition,canvases:document.querySelectorAll('#viewFlight').length,flag:document.body.dataset.viewTransition,scenes:TimeviewViews.inspect()}));
 assert.equal(state.active,view);assert.equal(state.motion,null);assert.equal(state.canvases,0);assert.equal(state.flag,undefined);
 assert.equal(Object.values(state.scenes).filter(s=>s.active).length,1);return state.scenes[view];
}
(async()=>{
 for(const [name,engine,options] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['phone',chromium,devices['iPhone 13']],['webkit',webkit,{...devices['iPhone 13']}]]){
  if(process.env.TEST_BROWSER&&process.env.TEST_BROWSER!==name)continue;
  const browser=await engine.launch({headless:true});
  try{
   const c=await browser.newContext({...options,serviceWorkers:'block'});if(setup)await setup(c);
   await c.addInitScript(scope=>{localStorage.setItem('guideSeen','1');sessionStorage.setItem('timeview:intro:4.1.0:'+scope,'1');sessionStorage.setItem('tv-clock-paused','1');window.marker=Math.random();},new URL(base).pathname);
   const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto(base+'app');await p.waitForFunction(()=>TimeviewPreload.ready&&!introActive,null,{polling:100,timeout:60000});
   const marker=await p.evaluate(()=>marker),date=Date.parse('2026-06-21T04:00:00Z');
   await p.evaluate(date=>TimeviewCourse.setTime(date),date);await p.waitForTimeout(200);
   await begin(p,'solar');const first=await p.evaluate(()=>({motion:TimeviewViews.transition,scenes:TimeviewViews.inspect(),pixels:document.getElementById('viewFlight').width*document.getElementById('viewFlight').height}));
   assert(first.motion.start.r>first.motion.end.r);assert(first.pixels<=1502000);
   assert.equal(Object.values(first.scenes).filter(s=>s.active).length,0);
   await p.waitForFunction(()=>TimeviewViews.transition?.progress>.45,null,{polling:10});
   const middle=await p.evaluate(()=>TimeviewViews.transition);assert(middle.earth.r<first.motion.earth.r);
   await p.screenshot({path:path.join(output,`v421-${name}-flight.png`)});
   let state=await landed(p,'solar');close(middle.end,state.earth);assert.equal(state.time,date);
   await p.evaluate(()=>{TimeviewCourse.layer('orbits',true);TimeviewCourse.layer('labels',true)});
   // Retain a rotated / zoomed solar camera, and land at its projected Earth.
   if(name==='desktop'){
    await p.mouse.move(630,370);await p.mouse.down();await p.mouse.move(710,425,{steps:15});await p.mouse.up();await p.mouse.wheel(0,-160);await p.waitForTimeout(1000);
   }
   const camera=await p.evaluate(()=>TimeviewViews.inspect().solar.camera);
   await begin(p,'earth');const inward=await p.evaluate(()=>TimeviewViews.transition);
   assert(inward?.earth,JSON.stringify({name,inward,scenes:await p.evaluate(()=>TimeviewViews.inspect())}));
   const inMiddle=await (await p.waitForFunction(()=>TimeviewViews.transition?.progress>.55&&TimeviewViews.transition,null,{polling:10})).jsonValue();
   assert(inMiddle.earth.r>inward.earth.r);
   await p.screenshot({path:path.join(output,`v421-${name}-return.png`)});
   state=await landed(p,'earth');assert.equal(state.time,date);close(inward.end,state.earth);
   await begin(p,'solar');const projected=await p.evaluate(()=>TimeviewViews.transition.end);
   state=await landed(p,'solar');close(projected,state.earth);assert.deepEqual(state.camera,camera);
   // A distant-planet close-up used to make the return silently crossfade.
   // Even when Earth is outside the frame, find it and retain a real zoom origin.
   await p.evaluate(()=>TimeviewCourse.focus('pluto',true));
   await begin(p,'earth');const recoveredOrigin=await p.evaluate(()=>TimeviewViews.transition.start);
   assert(recoveredOrigin&&recoveredOrigin.r>0);
   const viewport=await p.evaluate(()=>({width:innerWidth,height:innerHeight}));
   assert(recoveredOrigin.x>0&&recoveredOrigin.x<viewport.width&&recoveredOrigin.y>0&&recoveredOrigin.y<viewport.height);
   await landed(p,'earth');await p.evaluate(()=>TimeviewViews.switchTo('solar'));
   // Opposite selection during flight must settle, with no stale overlay/RAF.
   await begin(p,'earth');await p.evaluate(()=>{window.oldFlight=flightDone;window.flightDone=TimeviewViews.switchTo('solar')});
   assert.equal(await p.evaluate(()=>oldFlight),false);await landed(p,'solar');
   await begin(p,'earth');await p.setViewportSize({width:844,height:390});await landed(p,'earth');
   await p.waitForTimeout(100);await p.locator('#dateText').click();await p.locator('#datePicker').waitFor({state:'visible'});await p.locator('#dpCancel').click();
   await p.emulateMedia({reducedMotion:'reduce'});
   await p.evaluate(()=>{window.flightDone=TimeviewViews.switchTo('solar')});await landed(p,'solar');
   await p.evaluate(()=>{window.flightDone=TimeviewViews.switchTo('earth')});await landed(p,'earth');
   await p.emulateMedia({reducedMotion:'no-preference'});
   await p.locator('#pNow').click();const now=await p.evaluate(()=>TimeviewCourse.time());
   await begin(p,'solar');state=await landed(p,'solar');assert(state.playing&&state.time>now+1200);assert(Math.abs(state.time-Date.now())<1500);
   await begin(p,'earth');state=await landed(p,'earth');assert(state.playing&&Math.abs(state.time-Date.now())<1500);
   assert.equal(await p.evaluate(()=>marker),marker);assert.deepEqual(errors,[]);
   results.push({name,errors,checks:['real projection / both directions','bounded snapshot pixels / suspended scene loops','date / camera retained','interrupted animation','resize / calendar','reduced motion','running clock','same document']});console.log('PASS',name);
   await c.close();
  }finally{await browser.close()}
 }
 fs.writeFileSync(path.join(output,'v421-flight-results.json'),JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
