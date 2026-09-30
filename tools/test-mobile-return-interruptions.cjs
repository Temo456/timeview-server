const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const setup=process.env.TEST_SETUP_MODULE?require(process.env.TEST_SETUP_MODULE).setup:null;
const base=process.env.TEST_ORIGIN||'http://127.0.0.1:8767/',output=process.env.TEST_OUTPUT||'.';
const results=[];
const req=require('node:module').createRequire(require.resolve(process.env.PLAYWRIGHT_MODULE||'playwright'));
const {PNG}=require(path.join(path.dirname(req.resolve('playwright-core/package.json')),'lib/utilsBundle.js'));
async function visibleScene(p,name){
 const bounds=await p.evaluate(()=>TimeviewMobile.sceneRect()),size=p.viewportSize();
 const bytes=await p.screenshot({path:path.join(output,`v424-${name}.png`)}),png=PNG.sync.read(bytes);
 const sx=png.width/size.width,sy=png.height/size.height;let visible=0;
 for(let y=Math.ceil((bounds.top+20)*sy);y<Math.floor((bounds.bottom-20)*sy);y++){
  for(let x=Math.ceil(bounds.left*sx);x<Math.floor(bounds.right*sx);x++){
   const i=(y*png.width+x)*4;if(Math.max(png.data[i],png.data[i+1],png.data[i+2])>80)visible++;
  }
 }
 assert(visible>100,`${name}: the projected planet must actually be painted (${visible} bright pixels)`);
 return visible;
}
async function settled(p,view){await p.waitForFunction(view=>TIMEVIEW===view&&!TimeviewViews.transition,view,{polling:20,timeout:20000});}
async function begin(p){
 await p.locator('.topbar [data-view-target=earth]').tap();
 await p.waitForFunction(()=>TimeviewViews.transition?.phase==='zooming-earth',null,{polling:10});
}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const b=await engine.launch();try{
   const c=await b.newContext({...devices['iPhone 13'],serviceWorkers:'block'});if(setup)await setup(c);
   await c.addInitScript(()=>{
    const nativeRAF=requestAnimationFrame.bind(window),nativeCancel=cancelAnimationFrame.bind(window),delayed=new Map();let next=-1;
    window.testFrameDelay=0;
    window.requestAnimationFrame=callback=>{
     if(!window.testFrameDelay)return nativeRAF(callback);
     const id=next--,task={};delayed.set(id,task);
     task.timer=setTimeout(()=>{task.frame=nativeRAF(now=>{delayed.delete(id);callback(now);});},window.testFrameDelay);
     return id;
    };
    window.cancelAnimationFrame=id=>{
     const task=delayed.get(id);if(!task){nativeCancel(id);return;}
     clearTimeout(task.timer);if(task.frame)nativeCancel(task.frame);delayed.delete(id);
    };
   });
   const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto(base+'app');await p.waitForFunction(()=>TimeviewPreload.ready&&!introActive,null,{polling:100,timeout:60000});
   await p.evaluate(()=>{TimeviewCourse.setTime(Date.parse('2026-09-29T04:00:00Z'));});
   await p.evaluate(()=>TimeviewViews.switchTo('solar'));
   const original=await p.evaluate(()=>TimeviewViews.inspect().solar);
   await begin(p);
   // Safari browser chrome can report a resize even at the same dimensions.
   await p.evaluate(()=>{dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('resize'));});
   assert.equal(await p.evaluate(()=>TIMEVIEW),'solar');
   // Multiple height changes while a tap reveals/hides mobile browser controls.
   const h=p.viewportSize().height;
   for(const delta of [25,60,80]){
    await p.setViewportSize({width:390,height:h+delta});await p.waitForTimeout(60);
    assert.equal(await p.evaluate(()=>TimeviewViews.transition?.phase),'zooming-earth');
   }
   const enlarged=await p.evaluate(()=>TimeviewViews.inspect().solar);
   assert(enlarged.earth.r>original.earth.r*2);
   const paintedPixels=await visibleScene(p,name+'-viewport-zoom');
   await settled(p,'earth');
   const report=await p.evaluate(()=>TimeviewViews.lastTransition);
   assert.equal(report.interrupted,null);assert(report.resizes.length>=3&&report.resizes.every(r=>r.kept));assert(report.frames>=14);
   await p.evaluate(()=>TimeviewViews.switchTo('solar'));
   assert.deepEqual(await p.evaluate(()=>TimeviewViews.inspect().solar.camera),original.camera);
   await visibleScene(p,name+'-restored-solar');
   // Returning to the original height must restore CSS geometry and projection.
   await p.setViewportSize({width:390,height:h});await p.waitForTimeout(100);
   const resized=await p.evaluate(()=>({earth:TimeviewViews.inspect().solar.earth,height:document.querySelector('#scene canvas').getBoundingClientRect().height}));
   assert.equal(resized.height,h);assert(Math.abs(resized.earth.r-original.earth.r)<.1);await visibleScene(p,name+'-original-height');
   await begin(p);
   // Simulate a long task / delayed presentation on a resource-constrained phone.
   await p.evaluate(()=>{const end=performance.now()+950;while(performance.now()<end){};});
   await p.waitForTimeout(40);
   const afterStall=await p.evaluate(()=>({view:TIMEVIEW,state:TimeviewViews.transition}));
   assert.equal(afterStall.view,'solar');assert.equal(afterStall.state.phase,'zooming-earth');assert(afterStall.state.progress<.5);
   await settled(p,'earth');
   const slowReport=await p.evaluate(()=>TimeviewViews.lastTransition);assert.equal(slowReport.interrupted,null);assert(slowReport.frames>=14);
   await p.evaluate(()=>{window.testFrameDelay=33;return TimeviewViews.switchTo('solar');});await begin(p);
   await p.waitForFunction(()=>TimeviewViews.transition?.phase==='zooming-earth'&&TimeviewViews.transition.progress>.2,null,{polling:10});
   const slowZoom=await p.evaluate(()=>TimeviewViews.inspect().solar);assert(slowZoom.earth.r>original.earth.r*2);
   await settled(p,'earth');const lowFpsReport=await p.evaluate(()=>TimeviewViews.lastTransition);
   assert.equal(lowFpsReport.interrupted,null);assert(lowFpsReport.frames>=14&&lowFpsReport.frames<=40);
   await p.evaluate(()=>{window.testFrameDelay=0;});
   await p.evaluate(()=>TimeviewViews.switchTo('solar'));await begin(p);
   await p.setViewportSize({width:844,height:390});await settled(p,'earth');
   assert.equal(await p.evaluate(()=>TimeviewViews.lastTransition.interrupted),'viewport-width-or-desktop-resize');
   await p.locator('#dateText').tap();await p.locator('#datePicker').waitFor({state:'visible'});await p.locator('#dpCancel').tap();
   await p.evaluate(()=>TimeviewViews.switchTo('solar'));await visibleScene(p,name+'-landscape-solar');
   await p.evaluate(()=>TimeviewViews.switchTo('earth'));
   await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>TimeviewViews.switchTo('solar'));await p.evaluate(()=>TimeviewViews.switchTo('earth'));
   assert.equal(await p.evaluate(()=>TimeviewViews.lastTransition.interrupted),'reduced-motion');
   assert.equal(await p.locator('#viewFlight,#viewFlightCover').count(),0);assert.deepEqual(errors,[]);
   results.push({name,paintedPixels,report,afterStall,slowReport,lowFpsReport,errors});console.log('PASS mobile return interruption',name);
   await c.close();
  }finally{await b.close()}
 }
 fs.writeFileSync(path.join(output,'v424-mobile-return-results.json'),JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
