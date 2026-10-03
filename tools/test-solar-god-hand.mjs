import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const threeSource=fs.readFileSync(path.join(root,'vendor/three-0.160.0.module.min.js'));
const THREE=await import('data:text/javascript;base64,'+threeSource.toString('base64'));
const s=fs.readFileSync(root+'/solar-view.js','utf8');
const pointerSource=fs.readFileSync(root+'/solar-gestures.js','utf8');
class Target{
 constructor(){this.handlers={};this.textContent='';this.visible=true;this.attributes={};this.classList={toggle(){}};}
 addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);}
 dispatchEvent(e){for(const fn of this.handlers[e.type]||[])fn(e);}
 send(type,e={}){this.dispatchEvent({type,...e});}
 setAttribute(k,v){this.attributes[k]=v;}setPointerCapture(){}hasPointerCapture(){return false;}closest(){return null;}
}
function setup(enabled=true){
 let now=0;const canvas=new Target(),doc=new Target(),win=new Target(),overlay=new Target(),buttons=new Map();
 const dom={getElementById:k=>k==='skyLabelsLayer'?overlay:(buttons.get(k)||buttons.set(k,new Target()).get(k)),onDispose(){}};
 const c=vm.createContext({THREE,console,AbortController,Event:class{constructor(type){this.type=type;}},document:doc,window:win,renderer:{domElement:canvas},root:{},dom,performance:{now:()=>now},sessionStorage:{setItem(){}},innerWidth:1000,innerHeight:800});
 vm.runInContext(pointerSource,c);vm.runInContext(`const effectsState={enabled:false,clears:0,frame:null};globalThis.createGodHandEffects=()=>({setEnabled(on){effectsState.enabled=on;},clear(){effectsState.clears++;effectsState.frame=null;},render(frame){effectsState.frame=frame;},dispose(){}});`,c);
 vm.runInContext(`
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1000/800,.1,3000);camera.position.set(0,0,90);camera.lookAt(0,0,0);
 const worldGroup=new THREE.Group();scene.add(worldGroup);
 const PLANETS=[{key:'earth',period:365.25},{key:'mars',period:687},{key:'tiny',period:88}];
 const sphereMap=new Map(),objs=[];
 for(const [key,x,y,size] of [['earth',18,0,1.5],['mars',0,28,1.5],['tiny',-24,-15,.08],['sun',0,0,1.67]]){
  const group=new THREE.Group(),sphere=new THREE.Mesh(new THREE.SphereGeometry(size,32,16),new THREE.MeshBasicMaterial());
  group.position.set(x,y,0);group.add(sphere);worldGroup.add(group);sphereMap.set(sphere,key);
  if(key!=='sun'){const p=PLANETS.find(p=>p.key===key);p.size=size;p.name=key;objs.push({p,planetGroup:group,sphere});}
 }
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
 let planetDrag=null,planetInertia=null,paused=false,simElapsed=0,spinX=0,spinZ=0,spinXVel=0,spinZVel=0,courseCameraMove=null,courseFocus=null;
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),ROT_SENS=.005,SEC_PER_DAY=86400,SPD={sec:1};let scaleKey='sec';
 const sunEclipticLon=()=>((simElapsed/(365.25*SEC_PER_DAY)*360)%360+360)%360;
 let cards=[];const showCard=key=>cards.push(key),vger1={distLabel:{visible:false}},vger2={distLabel:{visible:false}};
 `,c);
 vm.runInContext(s.slice(s.indexOf('const canvasEl ='),s.indexOf('/* ============ 信息卡片')),c);
 vm.runInContext(s.slice(s.indexOf('function advancePlanetOrbit('),s.indexOf('/* ============ 动画循环')),c);
 const run=code=>vm.runInContext(code,c);if(enabled)run('setGodMode(true)');
 function state(){return JSON.parse(run('JSON.stringify({godMode,effectsState,simElapsed,paused,planetDrag,planetInertia,camera:camera.position.toArray(),spin:[spinX,spinZ],cards})'));}
 function pixel(key){return JSON.parse(run(`JSON.stringify((()=>{scene.updateMatrixWorld(true);camera.updateMatrixWorld();const m=[...sphereMap].find(([m,k])=>k===${JSON.stringify(key)})[0];const v=m.getWorldPosition(new THREE.Vector3()).project(camera);return {x:(v.x*.5+.5)*innerWidth,y:(.5-v.y*.5)*innerHeight};})())`));}
 function event(point,type='mouse',id=1,button=0){return {pointerId:id,pointerType:type,button,clientX:point.x,clientY:point.y,target:canvas,preventDefault(){}};}
 const api={canvas,doc,win,buttons,run,state,pixel,clock:t=>{now=t;},frame:()=>run('gestures.update();'),down:(p,type='mouse',id=1,button=0)=>canvas.send('pointerdown',event(p,type,id,button)),move:(p,type='mouse',id=1)=>doc.send('pointermove',event(p,type,id)),up:(p,type='mouse',id=1)=>doc.send('pointerup',event(p,type,id)),cancel:()=>doc.send('pointercancel',event({x:0,y:0})),
 begin:(p,type='mouse',button=0)=>run(`beginViewGesture({x:${p.x},y:${p.y},type:'${type}',button:${button}})`)};
 return api;
}
const shift=(p,x=0,y=0)=>({x:p.x+x,y:p.y+y});
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
function flick(t,type='mouse',direction=1){const p=t.pixel('earth');t.down(p,type);t.clock(type==='touch'?130:25);t.move(shift(p,0,-35*direction),type);t.frame();t.clock(type==='touch'?150:45);t.up(shift(p,0,-45*direction),type);}
test('mouse click on planet opens info without changing date or playback',()=>{const t=setup(),p=t.pixel('earth');t.down(p);t.clock(30);t.up(p);const s=t.state();assert.equal(s.simElapsed,0);assert.equal(s.paused,false);assert.deepEqual(s.cards,['earth']);assert.equal(s.planetInertia,null);});
test('touch jitter under 10 px remains a tap',()=>{const t=setup(),p=t.pixel('earth');t.down(p,'touch');t.clock(130);t.move(shift(p,3,5),'touch');t.frame();t.up(shift(p,3,5),'touch');assert.equal(t.state().simElapsed,0);assert.equal(t.state().paused,false);assert.deepEqual(t.state().cards,['earth']);});
test('planet drag pauses date, adds inertia, never rotates camera or opens card',()=>{const t=setup(),before=t.state();flick(t);const after=t.state();assert(after.simElapsed>0);assert(after.planetInertia.velocity>0);assert.equal(after.paused,true);assert.deepEqual(after.camera,before.camera);assert.deepEqual(after.spin,before.spin);assert.deepEqual(after.cards,[]);});
test('forward and reverse touch flicks retain their direction',()=>{for(const direction of [1,-1]){const t=setup();flick(t,'touch',direction);assert(Math.sign(t.state().simElapsed)===direction);assert(Math.sign(t.state().planetInertia.velocity)===direction);}});
test('quick touch flick under 100 ms is applied at release, not mistaken for a tap',()=>{const t=setup(),p=t.pixel('earth');t.down(p,'touch');t.clock(30);t.move(shift(p,0,-30),'touch');t.frame();assert.equal(t.state().simElapsed,0);t.clock(55);t.up(shift(p,0,-40),'touch');assert(t.state().simElapsed>0);assert(t.state().planetInertia);assert.deepEqual(t.state().cards,[]);});
test('drag starting in empty space stays rotation when crossing a planet',()=>{const t=setup(),p=t.pixel('earth');t.down(shift(p,70,0));t.clock(30);t.move(p);t.frame();t.up(p);assert.notEqual(t.state().spin[1],0);assert.equal(t.state().simElapsed,0);assert.equal(t.state().paused,false);assert.deepEqual(t.state().cards,[]);});
test('right and middle mouse buttons pan even directly on a planet',()=>{for(const button of [1,2]){const t=setup(),p=t.pixel('earth');t.down(p,'mouse',1,button);t.clock(25);t.move(shift(p,35,20));t.frame();t.up(shift(p,35,20));assert.notEqual(t.state().camera[0],0);assert.equal(t.state().simElapsed,0);assert.equal(t.state().paused,false);assert.deepEqual(t.state().cards,[]);}});
test('wheel over planet only zooms',()=>{const t=setup(),p=t.pixel('earth');t.canvas.send('wheel',{clientX:p.x,clientY:p.y,deltaY:100,deltaMode:0,preventDefault(){}});t.frame();assert.notEqual(t.state().camera[2],90);assert.equal(t.state().simElapsed,0);assert.equal(t.state().paused,false);});
test('second touch cancels queued planet drag before frame consumption',()=>{const t=setup(),p=t.pixel('earth');t.down(p,'touch');t.clock(30);t.move(shift(p,0,-30),'touch');t.clock(40);t.down(shift(p,60,0),'touch',2);assert.equal(t.state().simElapsed,0);assert.equal(t.state().planetDrag,null);t.move(shift(p,100,0),'touch',2);t.frame();assert.notEqual(t.state().camera[2],90);assert.equal(t.state().paused,false);});
test('second touch within reservation cancels without date jump after an earlier frame',()=>{const t=setup(),p=t.pixel('earth');t.down(p,'touch');t.clock(30);t.move(shift(p,0,-30),'touch');t.frame();t.clock(70);t.down(shift(p,60,0),'touch',2);assert.equal(t.state().simElapsed,0);assert.equal(t.state().paused,false);});
test('pinch leftover finger cannot rotate, scrub or create release inertia',()=>{const t=setup(),p=t.pixel('earth');t.down(p,'touch');t.clock(40);t.down(shift(p,60,0),'touch',2);t.move(shift(p,100,0),'touch',2);t.frame();t.up(shift(p,100,0),'touch',2);const before=t.state();t.clock(60);t.move(shift(p,0,-80),'touch');t.frame();t.up(shift(p,0,-90),'touch');const after=t.state();assert.deepEqual(after.camera,before.camera);assert.deepEqual(after.spin,before.spin);assert.equal(after.simElapsed,0);assert.equal(after.planetInertia,null);assert.deepEqual(after.cards,[]);});
test('second touch during active date drag discards queued delta and release momentum',()=>{const t=setup(),p=t.pixel('earth');t.down(p,'touch');t.clock(140);t.move(shift(p,0,-30),'touch');t.frame();const time=t.state().simElapsed;t.move(shift(p,0,-60),'touch');t.clock(160);t.down(shift(p,80,0),'touch',2);assert.equal(t.state().simElapsed,time);t.up(shift(p,80,0),'touch',2);t.up(shift(p,0,-60),'touch');assert.equal(t.state().planetInertia,null);});
test('hold still before release gives no inertia',()=>{const t=setup(),p=t.pixel('earth');t.down(p);t.clock(20);t.move(shift(p,0,-35));t.frame();t.clock(250);t.up(shift(p,0,-35));assert.equal(t.state().planetInertia,null);});
test('pointer cancellation and browser blur clear drag momentum',()=>{for(const reason of ['pointercancel','blur']){const t=setup();flick(t);assert(t.state().planetInertia);if(reason==='blur')t.win.send('blur');else{const p=t.pixel('earth');t.down(p);t.cancel();}assert.equal(t.state().planetInertia,null);assert.equal(t.state().planetDrag,null);}});
test('tiny planet touch halo is narrow; mouse needs an exact hit',()=>{const t=setup(),p=t.pixel('tiny');assert.equal(t.begin(shift(p,10,0),'mouse'),'rotate');assert.equal(t.begin(shift(p,10,0),'touch'),'orbit');assert.equal(t.begin(shift(p,20,0),'touch'),'rotate');});
test('ambiguous neighboring touch halos do not capture rotation',()=>{const t=setup(),p=t.pixel('tiny');t.run(`const clone=objs.find(o=>o.p.key==='tiny').planetGroup.clone();clone.position.x+=1.2;worldGroup.add(clone);objs.push({p:{key:'neighbor'},planetGroup:clone});PLANETS.push({key:'neighbor',period:100});sphereMap.set(clone.children[0],'neighbor');scene.updateMatrixWorld(true);`);const q=t.pixel('neighbor');assert.equal(t.begin({x:(p.x+q.x)/2,y:p.y+8},'touch'),'rotate');});
test('hidden bodies never steal a hit',()=>{const t=setup(),p=t.pixel('earth');t.run(`const blocker=new THREE.Group();blocker.visible=false;const mesh=new THREE.Mesh(new THREE.SphereGeometry(3),new THREE.MeshBasicMaterial());mesh.position.set(18,0,5);blocker.add(mesh);scene.add(blocker);sphereMap.set(mesh,'voyager1');`);assert.equal(t.begin(p),'orbit');});
test('nearly edge-on orbit view falls back to rotation instead of large date jumps',()=>{const t=setup();t.run('worldGroup.rotation.x=1.56;scene.updateMatrixWorld(true);');const p=t.pixel('earth');assert.equal(t.begin(p),'rotate');});
test('sky label always keeps its own tap/rotation handling',()=>{const t=setup(),p=t.pixel('earth');assert.equal(t.run(`beginViewGesture({x:${p.x},y:${p.y},type:'touch',button:0,target:{closest:()=>({})}})`),'rotate');assert.equal(t.state().planetDrag,null);});
test('inertia decays to a stop, preserves chosen date, and new press interrupts it',()=>{const t=setup();flick(t);t.run('for(let i=0;i<300;i++)updateOrbitalTime(1/60)');assert.equal(t.state().planetInertia,null);const time=t.state().simElapsed;t.run('updateOrbitalTime(1)');assert.equal(t.state().simElapsed,time);const u=setup();flick(u);u.down({x:900,y:700});assert.equal(u.state().planetInertia,null);});
test('Play cancels remaining inertia and resumes normal time',()=>{const t=setup();flick(t);const line=s.split('\n').find(x=>x.startsWith("dom.getElementById('pPlay').addEventListener"));t.run(line);t.buttons.get('pPlay').send('click');assert.equal(t.state().planetInertia,null);assert.equal(t.state().paused,false);const time=t.state().simElapsed;t.run('updateOrbitalTime(1)');assert.equal(t.state().simElapsed,time+1);});
test('default mode rotates even when starting on a planet, without scrubbing time',()=>{const t=setup(false);flick(t);assert.equal(t.state().godMode,false);assert.equal(t.state().simElapsed,0);assert.equal(t.state().planetInertia,null);assert.notEqual(t.state().spin[0],0);assert.equal(t.state().effectsState.enabled,false);});
test('button toggle freezes clock, restores playback on exit, and tracks accessible state',()=>{const t=setup(false);t.buttons.get('pGod').send('click');assert.equal(t.state().godMode,true);assert.equal(t.buttons.get('pGod').attributes['aria-pressed'],'true');t.run('updateOrbitalTime(1)');assert.equal(t.state().simElapsed,0);t.buttons.get('pGod').send('click');assert.equal(t.state().godMode,false);assert.equal(t.buttons.get('pGod').attributes['aria-pressed'],'false');t.run('updateOrbitalTime(1)');assert.equal(t.state().simElapsed,1);});
test('mode exit cancels an active drag and all effects without applying queued date changes',()=>{const t=setup();const p=t.pixel('earth');t.down(p);t.clock(25);t.move(shift(p,0,-40));const time=t.state().simElapsed;t.buttons.get('pGod').send('click');t.up(shift(p,0,-40));assert.equal(t.state().simElapsed,time);assert.equal(t.state().planetInertia,null);assert.equal(t.state().planetDrag,null);assert.equal(t.state().effectsState.enabled,false);});
test('mode toggle preserves a previously paused clock',()=>{const t=setup(false);t.run('paused=true;setGodMode(true);setGodMode(false);updateOrbitalTime(1)');assert.equal(t.state().simElapsed,0);assert.equal(t.state().paused,true);});
test('effects follow actual projected sphere and switch from grab to inertia',()=>{const t=setup(),p=t.pixel('earth');t.down(p);t.run('scene.updateMatrixWorld(true);camera.updateMatrixWorld();updateGodEffects()');let f=t.state().effectsState.frame;assert.equal(f.phase,'hold');assert(Math.abs(f.x-p.x)<1e-6);assert(Math.abs(f.y-p.y)<1e-6);assert(f.radius>0&&Number.isFinite(f.radius));t.clock(25);t.move(shift(p,0,-35));t.frame();t.run('updateGodEffects()');assert.equal(t.state().effectsState.frame.phase,'drag');t.clock(45);t.up(shift(p,0,-45));t.run('updateGodEffects()');f=t.state().effectsState.frame;assert.equal(f.phase,'inertia');assert.equal(f.pointer,null);t.win.send('blur');assert.equal(t.state().effectsState.frame,null);});
test('effects respect camera view offset and enlarged course planets',()=>{const t=setup();t.run("camera.setViewOffset(1000,800,120,0,1000,800);objs.find(o=>o.p.key==='earth').planetGroup.scale.setScalar(3);");const p=t.pixel('earth');t.down(p);t.run('updateGodEffects()');const f=t.state().effectsState.frame;assert(Math.abs(f.x-p.x)<1e-6);assert(f.radius>40);});
console.log(`${passed} mode and gesture regressions passed using actual Three.js raycasting, projection and production handlers`);
