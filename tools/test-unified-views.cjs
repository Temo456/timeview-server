/* Browser regression suite. PLAYWRIGHT_MODULE may point at an existing install.
 * TEST_ORIGIN defaults to the local app; optional TEST_SETUP_MODULE supplies fixtures. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_ORIGIN||'http://127.0.0.1:8767/';
const output=process.env.TEST_OUTPUT||'.';
const setup=process.env.TEST_SETUP_MODULE?require(process.env.TEST_SETUP_MODULE).setup:null;
const results=[];
async function invariants(p){
 const value=await p.evaluate(()=>{
  const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);
  return {duplicate:ids.filter((id,i)=>ids.indexOf(id)!==i),roots:document.querySelectorAll('#viewHost>.view-root').length,
   narrators:document.querySelectorAll('#tv-assist').length,toolbars:document.querySelectorAll('.bottombar').length,
   documentId:window.testDocumentId,active:TIMEVIEW,scenes:TimeviewViews.inspect(),intro:introActive};
 });
 assert.deepEqual(value.duplicate,[]);assert.equal(value.roots,1);assert.equal(value.narrators,1);assert.equal(value.toolbars,1);assert.equal(value.intro,false);
 assert.equal(Object.values(value.scenes).filter(v=>v.active).length,1);return value;
}
async function change(p,name){
 const began=Date.now();await p.locator('.topbar [data-view-target='+name+']').click();
 await p.waitForFunction(name=>TIMEVIEW===name&&TimeviewViews.inspect()[name].active,name,{timeout:15000});
 return Date.now()-began;
}
async function controls(p,mobile){
 await p.locator('#dateText').click();await p.locator('#datePicker').waitFor({state:'visible'});
 await p.locator('#tabLunar').click();assert(await p.locator('#lunarPanel').isVisible());
 await p.locator('#lunarDay').selectOption('20');await p.locator('#tabSolar').click();
 await p.locator('#dpTime').fill('09:23:45');await p.locator('#dpConfirm').click();
 assert.equal(await p.locator('#datePicker').isVisible(),false);
 if(mobile)await p.locator('#tvMobileMore').click();
 await p.locator('#spdBtn').click();await p.locator('.spd-opt[data-u=hour]').click();
 assert.equal(await p.evaluate(()=>TimeviewViews.inspect()[TIMEVIEW].unit),'hour');
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const [name,options] of [['desktop',{viewport:{width:1440,height:900}}],['phone',{...devices['iPhone 13']}],['landscape',{...devices['iPhone 13'],viewport:{width:844,height:390}}]]){
   const c=await browser.newContext({...options,serviceWorkers:'block'});
   try{
    if(setup)await setup(c);
    await c.addInitScript(scope=>{
     window.testDocumentId=Math.random().toString(36);localStorage.setItem('guideSeen','1');
     sessionStorage.setItem('timeview:intro:4.1.0:'+scope,'1');sessionStorage.setItem('tv-clock-paused','1');
    },new URL(base).pathname);
    const p=await c.newPage(),errors=[];let documents=0,playbackRequests=0;
    p.on('pageerror',error=>errors.push(error.message));
    p.on('request',r=>{if(r.resourceType()==='document')documents++;if(r.url().includes('/api/course-playback'))playbackRequests++});
    await p.goto(base+'app');await p.waitForFunction(()=>TimeviewPreload.ready&&!introActive,null,{timeout:60000});
    const initial=await invariants(p);assert.deepEqual(Object.keys(initial.scenes),['earth']);
    await p.evaluate(()=>{window.keptNarrator=document.getElementById('tv-assist');TimeviewCourse.setTime(Date.parse('2000-01-02T04:30:00Z'));});
    await controls(p,name!=='desktop');const expected=await p.evaluate(()=>TimeviewViews.inspect().earth);
    if(name==='desktop'){
     const failure=await p.evaluate(async()=>{
      const image=TimeviewPreload.image;TimeviewPreload.image=(img,url,...args)=>url.endsWith('pluto.jpg')?Promise.reject(Error('injected decode failure')):image(img,url,...args);
      let failed=false;try{await TimeviewViews.switchTo('solar')}catch(_){failed=true}finally{TimeviewPreload.image=image}
      return {failed,view:TIMEVIEW};
     });assert.deepEqual(failure,{failed:true,view:'earth'});
    }
    const firstSwitch=await change(p,'solar');let state=await invariants(p);
    assert.equal(state.documentId,initial.documentId);assert.equal(state.scenes.solar.time,expected.time);assert.equal(state.scenes.solar.playing,false);assert.equal(state.scenes.solar.unit,'hour');
    await controls(p,name!=='desktop');
    await p.evaluate(()=>{TimeviewCourse.layer('orbits',true);TimeviewCourse.layer('labels',true);});
    if(name==='desktop'){
     await p.mouse.move(650,350);await p.mouse.down();await p.mouse.move(710,395,{steps:12});await p.mouse.up();await p.mouse.wheel(0,-90);
    }else{
     const cd=await c.newCDPSession(p);
     await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:190,id:1},{x:220,y:190,id:2}]});
     for(let i=1;i<=8;i++)await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:120-i*3,y:190+i,id:1},{x:220+i*3,y:190+i,id:2}]});
     await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cd.detach();
    }
    await p.waitForTimeout(900);const camera=await p.evaluate(()=>TimeviewViews.inspect().solar.camera);
    const back=await change(p,'earth');state=await invariants(p);const frozen=state.scenes.solar.frame;
    await p.waitForTimeout(120);assert.equal(await p.evaluate(()=>TimeviewViews.inspect().solar.frame),frozen);
    const again=await change(p,'solar');const restored=await p.evaluate(()=>TimeviewViews.inspect().solar.camera);
    assert.ok(Math.hypot(...camera.map((v,i)=>v-restored[i]))<.1,JSON.stringify({camera,restored}));
    assert(await p.evaluate(()=>keptNarrator===document.getElementById('tv-assist')));
    await p.goBack();await p.waitForFunction(()=>TIMEVIEW==='earth'&&!TimeviewViews.transition);await invariants(p);
    await p.goForward();await p.waitForFunction(()=>TIMEVIEW==='solar'&&!TimeviewViews.transition);await invariants(p);
    await p.evaluate(()=>Promise.all([TimeviewViews.switchTo('earth'),TimeviewViews.switchTo('solar'),TimeviewViews.switchTo('earth')]));
    assert.equal((await invariants(p)).active,'earth');
    assert.equal(documents,1);assert.equal(playbackRequests,1);assert.deepEqual(errors,[]);
    await p.locator('#pNow').click();const runningTime=await p.evaluate(()=>TimeviewCourse.time());
    await change(p,'solar');await change(p,'earth');await p.waitForTimeout(300);
    const runningState=await p.evaluate(()=>TimeviewViews.inspect().earth);
    assert(runningState.playing&&runningState.time>runningTime&&Math.abs(runningState.time-Date.now())<2000);
    await p.screenshot({path:path.join(output,'v420-'+name+'-earth.png')});
    // Each visible view rebinds the mobile toolbar after portrait/landscape changes.
    if(name==='phone'){
     await p.setViewportSize({width:844,height:390});await change(p,'solar');await controls(p,true);await invariants(p);
     await p.setViewportSize({width:390,height:844});await change(p,'earth');await controls(p,true);await invariants(p);
    }
    results.push({name,firstSwitch,back,again,documents,playbackRequests,errors});console.log('PASS',name,JSON.stringify(results.at(-1)));
   }finally{await c.close()}
  }
  // A real lesson boundary must keep the same narrator and the preceding line.
  const c=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  try{
   if(setup)await setup(c);
   await c.addInitScript(scope=>{localStorage.setItem('guideSeen','1');sessionStorage.setItem('timeview:intro:4.1.0:'+scope,'1');sessionStorage.setItem('tv-course-v2-cosmos-basics',JSON.stringify({cursor:20,muted:true,closed:true,resume:false}));},new URL(base).pathname);
   const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'app');await p.waitForFunction(()=>TimeviewPreload.ready&&!introActive,null,{timeout:60000});
   await p.evaluate(()=>window.keptNarrator=document.getElementById('tv-assist'));
   await p.locator('#tv-fab').click();await p.locator('.skip-paragraph').last().waitFor();
   const previous=await p.locator('#tvLog .line p').first().innerText();
   await p.locator('.skip-paragraph').last().click();await p.waitForFunction(()=>TIMEVIEW==='solar'&&!TimeviewViews.transition);
   await p.waitForFunction(()=>document.querySelectorAll('#tvLog .line').length>=2);
   assert(await p.evaluate(()=>keptNarrator===document.getElementById('tv-assist')));assert((await p.locator('#tvLog').innerText()).includes(previous));
   await p.locator('#tvPlay').click();
   await change(p,'earth');await p.locator('#tvPlay').click();await p.waitForFunction(()=>TIMEVIEW==='solar'&&!TimeviewViews.transition);
   await p.evaluate(()=>{const s=document.getElementById('tvStage');s.value='11';s.dispatchEvent(new Event('change'));});
   await p.waitForFunction(()=>TIMEVIEW==='earth'&&!TimeviewViews.transition);await p.waitForFunction(()=>Math.abs(TimeviewCourse.time()-Date.now())<5000);
   assert((await p.evaluate(()=>TimeviewViews.inspect().earth)).playing);
   await p.locator('#tvPlay').click();assert.deepEqual(errors,[]);results.push({name:'lesson boundary / manual resume / return to now',errors});console.log('PASS course');
  }finally{await c.close()}
  for(const route of ['solar-system.html?t=946782000000','app?view=solar&t=946782000000','index.html?t=946782000000']){
   const c=await browser.newContext({serviceWorkers:'block'});try{
    if(setup)await setup(c);
    await c.addInitScript(scope=>{localStorage.setItem('guideSeen','1');sessionStorage.setItem('timeview:intro:4.1.0:'+scope,'1');sessionStorage.setItem('tv-clock-paused','1');},new URL(base).pathname);
    const p=await c.newPage();await p.goto(base+route);await p.waitForFunction(()=>TimeviewPreload.ready&&!introActive,null,{timeout:60000});
    assert.equal(await p.evaluate(()=>TIMEVIEW),route.includes('solar')?'solar':'earth');assert.equal(await p.evaluate(()=>TimeviewCourse.time()),946782000000);await invariants(p);console.log('PASS route',route);
   }finally{await c.close()}
  }
 }finally{await browser.close()}
 fs.writeFileSync(path.join(output,'v420-unified-results.json'),JSON.stringify(results,null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
