const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const setup=process.env.TEST_SETUP_MODULE?require(process.env.TEST_SETUP_MODULE).setup:null;
const base=process.env.TEST_ORIGIN||'http://127.0.0.1:8767/',output=process.env.TEST_OUTPUT||'.';
const results=[];
async function settled(page,name){await page.waitForFunction(name=>TIMEVIEW===name&&!TimeviewViews.transition,name,{polling:20,timeout:20000});}
async function clickAndCheck(page,name,selector){
 const before=await page.evaluate(()=>TimeviewViews.inspect().solar);
 const viewport=await page.evaluate(()=>({w:innerWidth,h:innerHeight}));
 assert(before.earth.x>0&&before.earth.x<viewport.w&&before.earth.y>0&&before.earth.y<viewport.h);
 await page.locator(selector).click();
 await page.waitForFunction(()=>TimeviewViews.transition?.phase==='zooming-earth',null,{polling:10});
 const enlarged=await (await page.waitForFunction(radius=>{
  const s=TimeviewViews.inspect().solar;
  return TIMEVIEW==='solar'&&TimeviewViews.transition?.phase==='zooming-earth'&&s.earth.r>radius*2&&s;
 },before.earth.r,{polling:10,timeout:5000})).jsonValue();
 assert(enlarged.active);assert(enlarged.camera[2]<before.camera[2]);assert(enlarged.earth.r>before.earth.r*2);
 await page.screenshot({path:path.join(output,`v423-${name}-real-zoom.png`)});
 await settled(page,'earth');const earth=await page.evaluate(()=>TimeviewViews.inspect().earth);
 assert.equal(earth.time,before.time);assert.equal(earth.playing,false);
 assert.equal(await page.locator('#viewFlight,#viewFlightCover').count(),0);
 await page.locator('.topbar [data-view-target=solar]').click();await settled(page,'solar');
 assert.deepEqual(await page.evaluate(()=>TimeviewViews.inspect().solar.camera),before.camera);
 return {before:before.earth,zoom:enlarged.earth,cameraBefore:before.camera,cameraDuring:enlarged.camera};
}
(async()=>{
 for(const [name,engine,options] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['phone',chromium,devices['iPhone 13']],['webkit',webkit,devices['iPhone 13']]]){
  const b=await engine.launch();try{
   const c=await b.newContext({...options,serviceWorkers:'block'});if(setup)await setup(c);
   await c.addInitScript(scope=>{localStorage.setItem('guideSeen','1');sessionStorage.setItem('timeview:intro:4.1.0:'+scope,'1');sessionStorage.setItem('tv-clock-paused','1');},new URL(base).pathname);
   const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto(base+'app');await p.waitForFunction(()=>TimeviewPreload.ready&&!introActive,null,{polling:100,timeout:60000});
   await p.evaluate(()=>TimeviewCourse.setTime(Date.parse('2026-09-29T04:00:00Z')));
   await p.locator('.topbar [data-view-target=solar]').click();await settled(p,'solar');
   const top=await clickAndCheck(p,name,'.topbar [data-view-target=earth]');
   if(name==='desktop')await clickAndCheck(p,name+'-bottom','.bottombar [data-view-target=earth]');
   // A second choice during the real-camera phase must stop the old return.
   await p.locator('.topbar [data-view-target=earth]').click();
   await p.waitForFunction(()=>TimeviewViews.transition?.phase==='zooming-earth',null,{polling:10});
   await p.evaluate(()=>TimeviewViews.switchTo('solar'));await settled(p,'solar');
   const cancelled=await p.evaluate(()=>TimeviewViews.inspect().solar.camera);await p.waitForTimeout(150);
   assert.deepEqual(await p.evaluate(()=>TimeviewViews.inspect().solar.camera),cancelled);
   await p.locator('.topbar [data-view-target=earth]').click();
   await p.waitForFunction(()=>TimeviewViews.transition?.phase==='zooming-earth',null,{polling:10});
   await p.emulateMedia({reducedMotion:'reduce'});await settled(p,'earth');
   assert.equal(await p.locator('#viewFlight,#viewFlightCover').count(),0);
   await p.emulateMedia({reducedMotion:'no-preference'});
   await p.evaluate(()=>TimeviewViews.switchTo('solar'));
   await p.evaluate(()=>TimeviewCourse.focus('pluto',true));await p.locator('.topbar [data-view-target=earth]').click();
   await p.waitForFunction(()=>TimeviewViews.transition?.phase==='zooming-earth',null,{polling:10});await settled(p,'earth');
   await p.locator('#pNow').click();await p.locator('.topbar [data-view-target=solar]').click();await settled(p,'solar');
   await p.locator('.topbar [data-view-target=earth]').click();await settled(p,'earth');
   const running=await p.evaluate(()=>TimeviewViews.inspect().earth);assert(running.playing&&Math.abs(running.time-Date.now())<1500);
   if(name!=='desktop')assert.equal(running.cities.labels.length,11);
   await p.locator('#dateText').click();await p.locator('#datePicker').waitFor({state:'visible'});await p.locator('#dpCancel').click();
   assert.deepEqual(errors,[]);results.push({name,...top,errors});console.log('PASS real camera return',name);
   await c.close();
  }finally{await b.close()}
 }
 fs.writeFileSync(path.join(output,'v423-real-camera-results.json'),JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
