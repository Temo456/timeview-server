/* Solar scene: lazily creates and reuses one WebGL renderer. */
window.TimeviewSceneFactories ||= {};
window.TimeviewSceneFactories.solar = async function(root, dom) {
'use strict';
let active=false, animationFrame=0;
const sceneLoading = dom.getElementById('sceneLoading');
const [THREE] = await Promise.all([
  window.TimeviewPreload.three()
]).catch(error => {
  sceneLoading.textContent = '太阳系加载失败，请刷新重试';
  throw error;
});

/* ============ 贴图 ============ */
const TEX = {
  sun: 'textures/sun.jpg',
  mercury: 'textures/mercury.jpg',
  venus: 'textures/venus.jpg',
  earth: 'textures/earth.jpg',
  mars: 'textures/mars.jpg',
  jupiter: 'textures/jupiter.jpg',
  saturn: 'textures/saturn.jpg',
  ring: 'textures/saturn_ring.png',
  uranus: 'textures/uranus.jpg',
  neptune: 'textures/neptune.jpg',
  pluto: 'textures/pluto.jpg',
};

/* ============ 行星介绍 ============ */
const INFO = {
  sun: { name:'太阳', en:'Sun', data:{ '直径':'139.2万 km','质量':'1.989×10³⁰ kg','表面温度':'5,500 °C','类型':'G2V 主序星' }, desc:'太阳系的中心天体，占太阳系总质量的99.86%。它通过核聚变反应将氢转化为氦，释放出巨大的能量，为地球上的生命提供光和热。' },
  mercury: { name:'水星', en:'Mercury', data:{ '直径':'4,879 km','公转周期':'88 天','自转周期':'58.6 天','表面温度':'-173 ~ 427 °C' }, desc:'太阳系最小、离太阳最近的行星。表面布满陨石坑，与月球类似。由于几乎没有大气层，昼夜温差极大。' },
  venus: { name:'金星', en:'Venus', data:{ '直径':'12,104 km','公转周期':'225 天','自转周期':'243 天（逆转）','表面温度':'462 °C' }, desc:'大小与地球相近，但拥有极厚的二氧化碳大气层，产生强烈的温室效应，是太阳系最热的行星。自转方向与其他行星相反。' },
  earth: { name:'地球', en:'Earth', data:{ '直径':'12,742 km','公转周期':'365.25 天','自转周期':'23.93 小时','卫星':'1（月球）' }, desc:'目前已知唯一存在生命的行星。拥有液态水海洋、含氧大气层和磁场，这些条件共同孕育了丰富多彩的生命。' },
  mars: { name:'火星', en:'Mars', data:{ '直径':'6,779 km','公转周期':'687 天','自转周期':'24.6 小时','卫星':'2' }, desc:'因表面富含氧化铁而呈红色，被称为"红色星球"。拥有太阳系最高的山（奥林帕斯山）和最长的峡谷（水手谷）。' },
  jupiter: { name:'木星', en:'Jupiter', data:{ '直径':'139,820 km','公转周期':'4,333 天','自转周期':'9.93 小时','卫星':'95+' }, desc:'太阳系最大的行星，质量是其他行星总和的2.5倍。著名的大红斑是一个持续了数百年的巨大反气旋风暴。' },
  saturn: { name:'土星', en:'Saturn', data:{ '直径':'116,460 km','公转周期':'10,759 天','自转周期':'10.7 小时','卫星':'140+' }, desc:'以壮丽的环系统闻名，由无数冰块和岩石碎片组成。密度低于水，是太阳系中唯一能"浮在水上"的行星。' },
  uranus: { name:'天王星', en:'Uranus', data:{ '直径':'50,724 km','公转周期':'84 年','自转周期':'17.2 小时（逆转）','卫星':'28' }, desc:'一颗冰巨行星，最显著的特征是自转轴几乎躺在轨道平面上（倾斜98°），像是"躺着"公转。' },
  neptune: { name:'海王星', en:'Neptune', data:{ '直径':'49,244 km','公转周期':'165 年','自转周期':'16.1 小时','卫星':'16' }, desc:'太阳系最远的行星，拥有太阳系最强的风（时速超2,000 km）。呈深蓝色，因大气中的甲烷吸收红光所致。' },
  pluto: { name:'冥王星', en:'Pluto', data:{ '直径':'2,377 km','公转周期':'248 年','自转周期':'6.4 天','卫星':'5' }, desc:'2006年被重新分类为矮行星。表面有心形的氮冰平原（斯普特尼克平原），由新视野号探测器于2015年首次拍摄。' },
  voyager1: { name:'旅行者1号', en:'Voyager 1', data:{ '发射日期':'1977年9月5日','当前距离':'~165 AU（约247亿公里）','当前速度':'~17 km/s','方向':'蛇夫座方向','状态':'仍在发送数据','已飞越':'木星(1979)、土星(1981)' }, desc:'离地球最远的人造物体。1990年拍摄了著名的"暗淡蓝点"照片。2012年穿越日球层进入星际空间，是第一个进入星际空间的人造飞行器。携带的金唱片收录了地球的声音、音乐和图片，作为给可能存在的外星文明的信息。' },
  voyager2: { name:'旅行者2号', en:'Voyager 2', data:{ '发射日期':'1977年8月20日','当前距离':'~140 AU（约210亿公里）','当前速度':'~15 km/s','方向':'人马座方向','状态':'仍在发送数据','已飞越':'木星(1979)、土星(1981)、天王星(1986)、海王星(1989)' }, desc:'唯一飞越过全部四颗外行星的探测器。2018年也穿越了日球层进入星际空间。两个旅行者探测器各携带一块镀金铜质金唱片，包含55种语言的问候语、各种自然声音、音乐以及115张图片。' },
};

/* ============ 时间 ============ */
const EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const SEC_PER_DAY = 86400;

/* ============ 行星数据 ============ */
const SUN_RADIUS = 1.67;
const PLANETS = [
  { name:'水星', key:'mercury', size:0.63, orbit:10, period:88, rotHours:1407.6, tilt:0.03, meanLon:252.25 },
  { name:'金星', key:'venus', size:1.425, orbit:14, period:225, rotHours:-5832.5, tilt:177, meanLon:181.98 },
  { name:'地球', key:'earth', size:1.50, orbit:18, period:365.25, rotHours:23.93, tilt:23.44, meanLon:100.46 },
  { name:'火星', key:'mars', size:0.90, orbit:23, period:687, rotHours:24.62, tilt:25, meanLon:355.45 },
  { name:'木星', key:'jupiter', size:2.80, orbit:35, period:4333, rotHours:9.93, tilt:3, meanLon:34.40 },
  { name:'土星', key:'saturn', size:2.40, orbit:48, period:10759, rotHours:10.7, tilt:26.7, meanLon:49.94, ring:true },
  { name:'天王星', key:'uranus', size:1.50, orbit:60, period:30687, rotHours:-17.24, tilt:98, meanLon:313.23 },
  { name:'海王星', key:'neptune', size:1.40, orbit:72, period:60190, rotHours:16.11, tilt:28, meanLon:304.88 },
  { name:'冥王星', key:'pluto', size:0.35, orbit:82, period:90560, rotHours:-153.3, tilt:122, meanLon:238.93 },
];
const MEAN_LON_RAD = Object.fromEntries(PLANETS.map(p => [p.key, THREE.MathUtils.degToRad(p.meanLon)]));

const SOLAR_TERMS = ['春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至','小寒','大寒','立春','雨水','惊蛰'];

function sunEclipticLon(elapsed = simElapsed) {
  // Use the same longitude as the calendar so orbit and date labels agree
  // at the exact instant a solar term starts.
  const astro=globalThis.TimeviewAstro;
  return astro.rev(astro.sunLon(astro.dnum(EPOCH_MS+elapsed*1000)));
}
function currentTermIndex() { return Math.floor(sunEclipticLon() / 15) % 24; }

/* ============ 基础场景 ============ */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1225);
// Update world matrices once, after animation and before both labels and rendering.
scene.matrixWorldAutoUpdate = false;

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 3000);
camera.position.set(0, 0, 200);
camera.up.set(0, 1, 0);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
dom.onDispose(()=>renderer.dispose());
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
let sceneWidth=innerWidth,sceneHeight=innerHeight;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
dom.getElementById('scene').appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const sunLight = new THREE.PointLight(0xffffff, 3.5, 0, 0);
scene.add(sunLight);

const xGroup = new THREE.Group(); scene.add(xGroup);
const worldGroup = new THREE.Group(); xGroup.add(worldGroup);

/* ============ 交互状态 ============ */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ROT_SENS = 0.005;
let spinZ = 0, spinX = 0, spinZVel = 0, spinXVel = 0;
let simElapsed = (Date.now() - EPOCH_MS) / 1000;
let clockManuallyPaused = false;
try { clockManuallyPaused = sessionStorage.getItem('tv-clock-paused') === '1'; } catch (_) {}
let scaleKey = 'sec', paused = clockManuallyPaused, labelsOn = false, axesOn = false, termsOn = false, orbitsOn = false;

// 拖拽行星状态
dom.getElementById('pPlay').textContent = paused ? '▶' : '❚❚';
let planetDrag = null; // { key, lastAngle, velocity, moved }
let planetInertia = null; // Initialized before async textures and gesture cleanup.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const sphereMap = new Map(); // sphere mesh → key

/* ============ 指针交互 ============ */
const canvasEl = renderer.domElement;

// Planet scrubbing is explicit; ordinary drags always move the camera.
let godMode=false,godPointer=null;
const godButton=dom.getElementById('pGod');
const godEffects=globalThis.createGodHandEffects(root);
godEffects.setEnabled(false);
dom.onDispose(()=>godEffects.dispose());
function syncGodMode(){
  godButton.setAttribute('aria-pressed',String(godMode));
  godButton.title=godMode?'关闭上帝之手，恢复普通观察':'开启后拖动星球拨动时间';
  canvasEl.classList.toggle('god-hand-active',godMode);
  canvasEl.title=godMode?'拖动星球拨动时间，松手后惯性流转；拖动空白旋转；双指缩放和平移':'轻点星球查看介绍；拖动旋转视角；双指缩放和平移';
  canvasEl.setAttribute('aria-label',canvasEl.title);
  dom.getElementById('pPlay').textContent=paused||godMode?'▶':'❚❚';
}
function setGodMode(on){
  gestures.cancel();godPointer=null;godMode=!!on;
  godEffects.setEnabled(godMode);syncGodMode();
}
godButton.addEventListener('click',()=>{
  window.dispatchEvent(new Event('timeview:manual-view'));
  setGodMode(!godMode);
});
syncGodMode();
let gesturePlaneZ=0,gestureMinDistance=.5,gestureMaxDistance=3000;
const gestureWorld=new THREE.Vector3(),orbitPlane=new THREE.Plane(),orbitHit=new THREE.Vector3(),orbitNormal=new THREE.Vector3(0,0,1);
function pickBody(point){
  scene.updateMatrixWorld(true);camera.updateMatrixWorld();
  pointer.set(point.x/innerWidth*2-1,1-point.y/innerHeight*2);
  raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(Array.from(sphereMap.keys()).filter(mesh=>{
    for(let node=mesh;node;node=node.parent)if(!node.visible)return false;
    return true;
  }),false)[0];
  return hit?sphereMap.get(hit.object):null;
}
function pickOrbitBody(point){
  const direct=pickBody(point);
  if(direct)return PLANETS.some(body=>body.key===direct)?direct:null;
  // Mouse picking is exact. A small, unambiguous touch halo helps tiny planets
  // without taking over ordinary empty-space rotation or neighboring targets.
  if(point.type!=='touch')return null;
  const candidates=[];
  for(const body of objs){
    const v=body.planetGroup.getWorldPosition(gestureWorld).project(camera);
    if(v.z < -1 || v.z > 1)continue;
    const distance=Math.hypot((v.x*.5+.5)*innerWidth-point.x,(-v.y*.5+.5)*innerHeight-point.y);
    if(distance<=14)candidates.push({key:body.p.key,distance});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  if(!candidates.length||(candidates[1]&&candidates[1].distance-candidates[0].distance<6))return null;
  return candidates[0].key;
}
function beginViewGesture(point){
  const focusBody=objs.find(body=>body.p.key===courseFocus);
  gesturePlaneZ=focusBody?focusBody.planetGroup.getWorldPosition(gestureWorld).z:0;
  if(camera.position.z-gesturePlaneZ<=0)gesturePlaneZ=camera.position.z-Math.max(.5,Math.abs(camera.position.z));
  const distance=camera.position.z-gesturePlaneZ;
  gestureMinDistance=Math.min(.5,distance);gestureMaxDistance=Math.max(3000,distance);
  courseCameraMove=null;spinXVel=spinZVel=0;planetInertia=null;planetDrag=null;godPointer=null;godEffects.clear();
  // Secondary buttons and wheels must never claim a planet/time gesture.
  if(point.type==='mouse'&&point.button!==0)return 'pan';
  if(point.type==='wheel'||point.target?.closest?.('#skyLabelsLayer .plabel'))return 'rotate';
  const key=godMode?pickOrbitBody(point):null;
  const angle=key?computeSunAngle(point.x,point.y):null;
  if(key&&angle!==null){
    planetDrag={key,lastAngle:angle,velocity:0,moved:false};godPointer={x:point.x,y:point.y};
    return 'orbit';
  }
  return 'rotate';
}
const gestures=globalThis.createSolarGestures(canvasEl,{
  begin:beginViewGesture,
  interact:()=>window.dispatchEvent(new Event('timeview:manual-view')),
  topology:count=>{spinXVel=spinZVel=0;planetInertia=null;if(count!==1){planetDrag=null;godPointer=null;godEffects.clear();}},
  zoom:(from,to,ratio)=>{
    const distance=camera.position.z-gesturePlaneZ;
    const next=clamp(distance*ratio,gestureMinDistance,gestureMaxDistance);
    const unit=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/innerHeight;
    const nextUnit=unit*next/distance;
    // The optical center can be shifted to leave room for teaching cards.
    const centerX=(1-camera.projectionMatrix.elements[8])*innerWidth/2;
    const centerY=(1+camera.projectionMatrix.elements[9])*innerHeight/2;
    camera.position.x+=(from.x-centerX)*unit-(to.x-centerX)*nextUnit;
    camera.position.y-=(from.y-centerY)*unit-(to.y-centerY)*nextUnit;
    camera.position.z=gesturePlaneZ+next;
    if(camera.far<next+1000){camera.far=next+1000;camera.updateProjectionMatrix();}
  },
  rotate:(dx,dy,dt)=>{
    const x=dy*ROT_SENS,z=dx*ROT_SENS;
    spinX=clamp(spinX+x,-Math.PI*.49,Math.PI*.49);spinZ+=z;
    const weight=1-Math.exp(-18*dt);
    spinXVel+=(clamp(x/dt,-3,3)-spinXVel)*weight;
    spinZVel+=(clamp(z/dt,-3,3)-spinZVel)*weight;
  },
  orbit:(point,dt)=>{
    if(!planetDrag)return;
    godPointer={x:point.x,y:point.y};
    const angle=computeSunAngle(point.x,point.y);if(angle===null)return;
    const previous=planetDrag.lastAngle;planetDrag.lastAngle=angle;if(previous===null)return;
    const delta=Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous));
    if(Math.abs(delta)<1e-6)return;
    if(!planetDrag.moved){
      // Only an actual date drag pauses playback; a tap or pinch does not.
      paused=true;
      try{sessionStorage.setItem('tv-clock-paused','1');}catch(_){}
      dom.getElementById('pPlay').textContent='▶';
    }
    advancePlanetOrbit(planetDrag.key,delta);
    const velocity=clamp(delta/dt,-3,3);
    // Smooth release velocity so the final pointer sample cannot cause a jerk.
    planetDrag.velocity=planetDrag.moved
      ? planetDrag.velocity+(velocity-planetDrag.velocity)*(1-Math.exp(-20*dt))
      : velocity;
    planetDrag.moved=true;
  },
  tap:point=>{
    const skyLabel=point.target?.closest?.('#skyLabelsLayer .plabel');
    if(skyLabel){skyLabel.querySelector('.name')?.click();return;}
    const key=pickBody(point);if(!key)return;
    showCard(key,point.x,point.y);
    if(key==='voyager1')vger1.distLabel.visible=!vger1.distLabel.visible;
    if(key==='voyager2')vger2.distLabel.visible=!vger2.distLabel.visible;
  },
  end:(inertia,mode,cancelled)=>{
    if(inertia&&mode==='orbit'&&planetDrag?.moved&&Math.abs(planetDrag.velocity)>=0.01)planetInertia={key:planetDrag.key,velocity:planetDrag.velocity};
    else planetInertia=null;
    if(!inertia||mode!=='rotate')spinXVel=spinZVel=0;
    planetDrag=null;godPointer=null;
    if(cancelled)godEffects.clear();
  }
},[dom.getElementById('skyLabelsLayer')]);
dom.onDispose(()=>gestures.dispose());

// 计算屏幕点到太阳的角度（在世界坐标 z=0 平面上）
function computeSunAngle(cx, cy) {
  pointer.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  // Intersect the actual tilted orbital plane, not the screen's z=0 plane.
  worldGroup.updateWorldMatrix(true,false);
  orbitPlane.set(orbitNormal,0).applyMatrix4(worldGroup.matrixWorld);
  // Near an edge-on orbital plane, tiny screen motion can jump the date.
  if(Math.abs(raycaster.ray.direction.dot(orbitPlane.normal))<0.08)return null;
  if(!raycaster.ray.intersectPlane(orbitPlane,orbitHit))return null;
  worldGroup.worldToLocal(orbitHit);
  if(orbitHit.lengthSq()<.0001)return null;
  return Math.atan2(orbitHit.y,orbitHit.x);
}

/* ============ 信息卡片 ============ */
const cardEl = dom.getElementById('planetCard');
dom.getElementById('cardClose').addEventListener('click', () => cardEl.style.display = 'none');

function showCard(key, cx, cy, course = false) {
  const info = INFO[key]; if (!info) return;
  delete cardEl.dataset.skyLayer;
  cardEl.classList.add('course-card');
  root.appendChild(cardEl);
  cardEl.style.transform = '';
  dom.getElementById('cardName').textContent = info.name;
  dom.getElementById('cardEn').textContent = info.en;
  const grid = dom.getElementById('cardGrid');
  grid.innerHTML = '';
  for (const [k, v] of Object.entries(info.data)) {
    grid.innerHTML += `<dt>${k}</dt><dd>${v}</dd>`;
  }
  dom.getElementById('cardDesc').textContent = info.desc;
  window.TimeviewCards.show(cardEl);
}

function showConstellationCard(c) {
  cardEl.dataset.skyLayer = c.type;
  cardEl.classList.add('course-card'); root.appendChild(cardEl);
  const typeLabel = c.type === 'zodiac' ? '黄道星座' : '二十八星宿';
  dom.getElementById('cardName').textContent = c.name;
  dom.getElementById('cardEn').textContent = typeLabel;
  dom.getElementById('cardGrid').innerHTML = '';
  dom.getElementById('cardDesc').textContent = c.desc;
  window.TimeviewCards.show(cardEl);
}

/* ============ 控件 ============ */
const p2 = n => String(n).padStart(2, '0');
function formatInput(d) { return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; }
let dateDisplaySecond=null;
function updateDateText() {
  const ts=EPOCH_MS+simElapsed*1000;
  const second=Math.floor(ts/1000);if(second===dateDisplaySecond)return;dateDisplaySecond=second;
  const dateStr=new Date(ts+480*60000).toISOString().slice(0,19).replace('T',' ')+' UTC+8 北京';
  updateLunar();
  const text=dateStr+lunarDisplaySuffix,el=dom.getElementById('dateText');
  if(el.textContent!==text)el.textContent=text;
}

/* ============ 农历转换 ============ */
const LUNAR_MONTH_NAMES = ['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','腊月'];
const LUNAR_DAY_NAMES = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
const HEAVENLY_STEMS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const EARTHLY_BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const ZODIAC_ANIMALS = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];

// 农历数据：1900-2100，每行16位编码（闰月+大小月）
// 高4位=闰月月份（0=无闰月），低12位=每月大小（1=30天，0=29天），闰月大小在最后一位
const LUNAR_INFO = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
  0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
  0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
  0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
  0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
  0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
  0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
  0x0d520,
];

// 农历某年闰月月份，0=无闰月
function lunarLeapMonth(y) { return LUNAR_INFO[y - 1900] & 0xf; }
// 农历某年闰月天数
function lunarLeapDays(y) { return lunarLeapMonth(y) ? (LUNAR_INFO[y - 1900] & 0x10000 ? 30 : 29) : 0; }
// 农历某年某月天数
function lunarMonthDays(y, m) { return LUNAR_INFO[y - 1900] & (0x10000 >> m) ? 30 : 29; }
// 农历某年总天数
function lunarYearDays(y) {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
  return sum + lunarLeapDays(y);
}

// 农历1900年正月初一 = 公历1900年1月31日
const LUNAR_BASE = new Date(1900, 0, 31);
const LUNAR_BASE_MS = LUNAR_BASE.getTime();

// 公历日期 → 农历
function solarToLunar(date) {
  const y=date.getFullYear(), m=date.getMonth()+1, d=date.getDate();
  if (Date.UTC(y,m-1,d)<Date.UTC(1900,0,31)) return null;
  const lunar=globalThis.TimeviewLunar.solarToLunar(y,m,d);
  if(!lunar)return null;
  const {year,month,day,isLeap}=lunar;
  // 天干地支
  const stem = (year - 4) % 10;
  const branch = (year - 4) % 12;
  return {
    year, month, day, isLeap,
    yearStr: HEAVENLY_STEMS[stem] + EARTHLY_BRANCHES[branch] + '年',
    animal: ZODIAC_ANIMALS[branch],
    monthStr: (isLeap ? '闰' : '') + LUNAR_MONTH_NAMES[month - 1],
    dayStr: LUNAR_DAY_NAMES[day - 1],
  };
}

// 农历转公历
function lunarToSolar(y, m, d, isLeap) {
  return globalThis.TimeviewLunar.lunarToSolar(y,m,d,isLeap);
}

let lunarDisplayKey='', lunarDisplaySuffix='';
function updateLunar() {
  const ts=EPOCH_MS+simElapsed*1000;
  const key=Math.floor(ts/60000);
  if(key===lunarDisplayKey)return;
  lunarDisplayKey=key;
  const date=new Date(ts+480*60000);
  const lunar=globalThis.TimeviewLunar.solarToLunar(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate());
  const term=globalThis.TimeviewAstro.solarTerm(globalThis.TimeviewAstro.dnum(ts));
  lunarDisplaySuffix=(lunar?' · '+(lunar.isLeap?'闰':'')+LUNAR_MONTH_NAMES[lunar.month-1]+LUNAR_DAY_NAMES[lunar.day-1]:'')+' · '+term.name;
}

/* 底部工具条按钮 */
const SPD = { sec:1, hour:3600, day:86400, month:86400*30, year:86400*365.25 };
const SPD_LABELS = { sec:'秒/秒', hour:'时/秒', day:'日/秒', month:'月/秒', year:'年/秒' };

dom.getElementById('pPlay').addEventListener('click', () => { const wasGod=godMode;setGodMode(false);paused=wasGod?false:!paused; try { sessionStorage.setItem('tv-clock-paused', paused ? '1' : '0'); } catch (_) {} dom.getElementById('pPlay').textContent = paused ? '▶' : '❚❚'; });
dom.getElementById('pNow').addEventListener('click', () => { setGodMode(false);simElapsed = (Date.now() - EPOCH_MS) / 1000;scaleKey = 'sec';paused=false;try{sessionStorage.setItem('tv-clock-paused','0');}catch(_){} dom.getElementById('pPlay').textContent = '❚❚'; dom.getElementById('spdBtn').textContent = '⚡ 秒/秒 ▾'; });
dom.getElementById('pPrev').addEventListener('click', () => { simElapsed -= 30 * 86400; });
dom.getElementById('pNext').addEventListener('click', () => { simElapsed += 30 * 86400; });
dom.getElementById('pSlow').addEventListener('click', () => { const u = ['sec','hour','day','month','year']; const i = u.indexOf(scaleKey); if (i > 0) { scaleKey = u[i-1]; dom.getElementById('spdBtn').textContent = '⚡ ' + SPD_LABELS[scaleKey] + ' ▾'; } });
dom.getElementById('pFast').addEventListener('click', () => { const u = ['sec','hour','day','month','year']; const i = u.indexOf(scaleKey); if (i < u.length-1) { scaleKey = u[i+1]; dom.getElementById('spdBtn').textContent = '⚡ ' + SPD_LABELS[scaleKey] + ' ▾'; } });

// 速度弹窗
dom.getElementById('spdBtn').addEventListener('click', () => {
  const popup = dom.getElementById('spdPopup');
  popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
});
dom.querySelectorAll('.spd-opt').forEach(el => {
  el.addEventListener('click', () => {
    scaleKey = el.dataset.u;
    dom.getElementById('spdBtn').textContent = '⚡ ' + SPD_LABELS[scaleKey] + ' ▾';
    dom.querySelectorAll('.spd-opt').forEach(o => o.classList.toggle('on', o.dataset.u === scaleKey));
    dom.getElementById('spdPopup').style.display = 'none';
  });
});
dom.onDocument('click', (e) => {
  if (!e.target.closest('#spdPopup') && !e.target.closest('#spdBtn')) dom.getElementById('spdPopup').style.display = 'none';
});

// 标签/节气切换
// 图层弹窗
let voyagerOn = false;
let earthAxisPreference = null;
try { const saved=localStorage.getItem('tv-earth-axis'); if(saved!==null)earthAxisPreference=saved==='1'; } catch (_) {}
function setEarthAxis(visible) {
  earthGuides.visible=!!visible;
  dom.querySelector('[data-layer="earthAxis"]')?.classList.toggle('on',!!visible);
}
const layerConfig = {
  labels: { get: () => labelsOn, set: (v) => { labelsOn = v; labelsLayer.style.display = v ? '' : 'none'; [[xLine,xLabel],[yLine,yLabel],[zLine,zLabel]].forEach(([line,label]) => label.visible = v && line.visible); } },
  terms: { get: () => termsOn, set: (v) => { termsOn = v; termLabelsLayer.style.display=v?'':'none'; } },
  orbits: { get: () => orbitsOn, set: (v) => { orbitsOn = v; for (const l of orbitLines) l.visible = v; } },
  axes: { get: () => axesOn, set: (v) => {
    axesOn = !!v; axesGroup.visible = axesOn;
    // Reset/lessons also hide the children; a manual toggle restores all axes.
    [xLine,yLine,zLine].forEach(line => line.visible = axesOn);
    [xLabel,yLabel,zLabel].forEach(label => label.visible = axesOn && labelsOn);
  } },
  earthAxis: { get: () => earthGuides.visible, set: setEarthAxis },
  zodiac: { get: () => zodiacOn, set: (v) => setSkyLayer('zodiac', v) },
  xiusu: { get: () => xiusuOn, set: (v) => setSkyLayer('xiusu', v) },
  threeBody: { get: () => threeBodyOn, set: (v) => {
    threeBodyOn = v; threeBodyGroup.visible = v;
    if (!v) dom.getElementById('threeBodyCard').style.display = 'none';
  } },
  voyager: { get: () => voyagerOn, set: (v) => { voyagerOn = v; vger1.group.visible = v; vger2.group.visible = v; vger1.trail.visible = v; vger2.trail.visible = v; } }
};

// Every entry point (lesson, report and manual controls) uses the same invariant.
function setSkyLayer(key, visible) {
  if (visible) {
    cardEl.style.display='none';
    dom.getElementById('threeBodyCard').style.display='none';
  }
  if (key === 'zodiac') { zodiacOn = !!visible; if (visible) xiusuOn = false; }
  else { xiusuOn = !!visible; if (visible) zodiacOn = false; }
  zodiacGroup.visible = zodiacOn; xiusuGroup.visible = xiusuOn;
  for (const cl of constellationLabels) cl.el.style.display = cl.group.visible ? '' : 'none';
  for (const name of ['zodiac','xiusu']) {
    dom.querySelector(`[data-layer="${name}"]`)?.classList.toggle('on', name === 'zodiac' ? zodiacOn : xiusuOn);
  }
  if (cardEl.dataset.skyLayer && !(cardEl.dataset.skyLayer === 'zodiac' ? zodiacOn : xiusuOn)) cardEl.style.display = 'none';
}

dom.getElementById('layerBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const popup = dom.getElementById('layerPopup');
  if (popup.style.display !== 'none') { popup.style.display = 'none'; return; }
  dom.querySelectorAll('.layer-opt').forEach(el => {
    const layer = el.dataset.layer;
    el.classList.toggle('on', layerConfig[layer]?.get() || false);
  });
  const rect = e.currentTarget.getBoundingClientRect();
  let left = rect.left;
  const popupW = 170;
  if (left + popupW > innerWidth) left = innerWidth - popupW - 8;
  if (left < 8) left = 8;
  popup.style.left = left + 'px';
  popup.style.bottom = (innerHeight - rect.top + 6) + 'px';
  popup.style.display = 'block';
});

dom.querySelectorAll('.layer-opt').forEach(el => {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const layer = el.dataset.layer;
    if (!layerConfig[layer]) return;
    const skyChoice=['zodiac','xiusu'].includes(layer);
    const newVal = !layerConfig[layer].get();
    if (layer==='earthAxis') {
      earthAxisPreference=newVal;
      try { localStorage.setItem('tv-earth-axis',newVal?'1':'0'); } catch (_) {}
    }
    if (newVal && ['zodiac','xiusu'].includes(layer)) window.TimeviewCards.hide();
    layerConfig[layer].set(newVal);
    if(skyChoice) {
      window.dispatchEvent(new Event('timeview:manual-view'));
      if(newVal)focusCourse(layer);
    }
    el.classList.toggle('on', newVal);
    // 同步checkbox样式
    dom.querySelectorAll('.layer-opt').forEach(o => {
      const l = o.dataset.layer;
      o.classList.toggle('on', layerConfig[l]?.get() || false);
    });
  });
});

dom.onDocument('click', (e) => {
  if (!e.target.closest('#layerPopup') && !e.target.closest('#layerBtn')) {
    dom.getElementById('layerPopup').style.display = 'none';
  }
});

// 点击星座/星宿标签显示详情
dom.getElementById('skyLabelsLayer').addEventListener('click', (e) => {
  const span = e.target.closest('.name');
  if (!span) return;
  for (const ct of constellationClickTargets) {
    if (ct.el.contains(span)) {
      showConstellationCard(ct.data);
      return;
    }
  }
});

// 点击三体恒星显示信息卡
dom.getElementById('scene').addEventListener('click', (e) => {
  if (!threeBodyOn) return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([tbStarA, tbStarB, tbStarC], false);
  if (hits.length > 0) {
    window.TimeviewCards.show(dom.getElementById('threeBodyCard'));
  }
});
dom.getElementById('tbClose').onclick = () => { dom.getElementById('threeBodyCard').style.display = 'none'; };

function resizeScene() {
  if(sceneWidth===innerWidth&&sceneHeight===innerHeight)return;
  const sameWidth=sceneWidth===innerWidth;sceneWidth=innerWidth;sceneHeight=innerHeight;
  const offset=cameraFrameOffset();
  camera.aspect=innerWidth/innerHeight;applyCameraFrame(offset);camera.updateProjectionMatrix();
  if(window.TimeviewMobile?.active()&&sameWidth){
    // Keep the drawing buffer stable while mobile browser chrome animates.
    // CSS scaling plus the updated projection preserves the screen geometry.
    renderer.domElement.style.height=innerHeight+'px';
    return;
  }
  renderer.setSize(innerWidth,innerHeight);
}
dom.onWindow('resize',resizeScene);
updateDateText();

/* ============ 日期选择器 ============ */

let dpYear = new Date().getFullYear(), dpMonth = new Date().getMonth(), dpSelected = new Date().getDate();
const syncLunarPicker=TimeviewCalendar.lunarPicker(()=>({y:dpYear,m:dpMonth+1,d:dpSelected}),(y,m,d)=>{dpYear=y;dpMonth=m-1;dpSelected=d;renderCalendar()},dom);
function setPickerDraft(ts){
  const d=new Date(ts+(window.courseBeijingTime?480:-new Date(ts).getTimezoneOffset())*60000);
  dpYear=d.getUTCFullYear();dpMonth=d.getUTCMonth();dpSelected=d.getUTCDate();
  dom.getElementById('dpTime').value=[d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds()].map(n=>String(n).padStart(2,'0')).join(':');
  renderCalendar();syncLunarPicker();
}
function switchCalTab(tab) {
  dom.getElementById('tabSolar').className = 'dp-tab' + (tab === 'solar' ? ' active' : '');
  dom.getElementById('tabLunar').className = 'dp-tab' + (tab === 'lunar' ? ' active' : '');
  dom.getElementById('solarPanel').style.display = tab === 'solar' ? '' : 'none';
  dom.getElementById('lunarPanel').style.display = tab === 'lunar' ? '' : 'none';
  if(tab==='lunar')syncLunarPicker();
}
function dpNav(dir) { dpMonth += dir; if (dpMonth < 0) { dpMonth = 11; dpYear--; } if (dpMonth > 11) { dpMonth = 0; dpYear++; } renderCalendar(); }
// 绑定日期选择器标签与月份导航（脚本为 ES module，函数不挂到 window，不能用内联 onclick）
dom.getElementById('tabSolar').addEventListener('click', () => switchCalTab('solar'));
dom.getElementById('tabLunar').addEventListener('click', () => switchCalTab('lunar'));
dom.getElementById('dpPrev').addEventListener('click', () => dpNav(-1));
dom.getElementById('dpNext').addEventListener('click', () => dpNav(1));
function renderCalendar() {
  dpSelected=Math.min(Math.max(1,dpSelected),new Date(dpYear,dpMonth+1,0).getDate());
  dom.getElementById('dpTitle').textContent = (dpMonth + 1) + '月';
  var ySel = dom.getElementById('dpYear');
  if (ySel) {
    ySel.min = new Date().getFullYear() - 5000;
    ySel.max = new Date().getFullYear() + 5000;
    if (!ySel.dataset.bound) { ySel.dataset.bound = '1'; ySel.onchange = function() { dpYear = parseInt(this.value) || dpYear; renderCalendar(); }; }
    ySel.value = dpYear;
  }
  var grid = dom.getElementById('dpGrid'); grid.innerHTML = '';
  ['日','一','二','三','四','五','六'].forEach(function(d) { var el = document.createElement('div'); el.className = 'dp-cell head'; el.textContent = d; grid.appendChild(el); });
  var firstDay = new Date(dpYear, dpMonth, 1).getDay();
  var daysInMonth = new Date(dpYear, dpMonth + 1, 0).getDate();
  var daysInPrev = new Date(dpYear, dpMonth, 0).getDate();
  var now = new Date();
  for (var i = 0; i < firstDay; i++) { var el = document.createElement('div'); el.className = 'dp-cell other'; el.textContent = daysInPrev - firstDay + 1 + i; grid.appendChild(el); }
  for (var d = 1; d <= daysInMonth; d++) {
    var el = document.createElement('button');el.type='button';el.className = 'dp-cell';
    if (d === now.getDate() && dpMonth === now.getMonth() && dpYear === now.getFullYear()) el.classList.add('today');
    if (d === dpSelected) el.classList.add('selected');
    TimeviewCalendar.decorateCell(el,dpYear,dpMonth+1,d);
    el.onclick = (function(dd) { return function(event) { event.stopPropagation();dpSelected = dd; renderCalendar(); }; })(d);
    grid.appendChild(el);
  }
  var remaining = 42 - firstDay - daysInMonth;
  for (var i = 1; i <= remaining; i++) { var el = document.createElement('div'); el.className = 'dp-cell other'; el.textContent = i; grid.appendChild(el); }
  TimeviewCalendar.selection(dpYear,dpMonth+1,dpSelected,dom);
}
function jumpToDate() {
  var ts = dom.getElementById('dpTime').value || '12:00';
  var hm = ts.split(':');
  var target = new Date(0);
  if(window.courseBeijingTime){target.setUTCFullYear(dpYear,dpMonth,dpSelected);target.setUTCHours(+hm[0]||0,+hm[1]||0,+hm[2]||0,0);target.setTime(target.getTime()-480*60000);}
  else{target.setFullYear(dpYear,dpMonth,dpSelected);target.setHours(+hm[0]||0,+hm[1]||0,+hm[2]||0,0);}
  simElapsed = (target.getTime() - EPOCH_MS) / 1000;
 
  dom.getElementById('pPlay').textContent = paused ? '▶' : '❚❚';
}
dom.getElementById('dateText').onclick = function() {
  var picker = dom.getElementById('datePicker');
  if (picker.style.display === 'none') { setPickerDraft(EPOCH_MS+simElapsed*1000); picker.style.display = 'block'; }
  else { picker.style.display = 'none'; }
};
dom.getElementById('dpCancel').onclick = function() { dom.getElementById('datePicker').style.display = 'none'; };
dom.getElementById('dpToday').onclick = function() {
  setPickerDraft(Date.now());
};
dom.getElementById('dpConfirm').onclick=function(){
  const input=dom.getElementById('dpTime');input.required=true;if(!input.reportValidity())return;
  window.dispatchEvent(new Event('timeview:manual-view'));gestures.cancel();planetInertia=null;jumpToDate();
  updateDateText();dom.getElementById('datePicker').style.display='none';
};
dom.onDocument('pointerdown', function(e) {
  if (!e.target.closest('#datePicker') && !e.target.closest('#dateText')) {
    dom.getElementById('datePicker').style.display = 'none';
  }
});
// Lunar controls use the shared draft picker above.

// 从地球视角跳转过来时，把日期/时间带过来（URL ?t=<ms>）
(function applyIncomingTime() {
  const m = location.search.match(/[?&]t=(-?\d+)/);
  if (!m) return;
  const t = parseInt(m[1], 10);
  if (isNaN(t)) return;
  simElapsed = (t - EPOCH_MS) / 1000;
 
  dom.getElementById('pPlay').textContent = paused ? '▶' : '❚❚';
  const d = new Date(t);
  dpYear = d.getFullYear(); dpMonth = d.getMonth(); dpSelected = d.getDate();
  updateDateText();
})();

/* ============ 工具函数 ============ */
async function loadTexture(url) {
  const img=await window.TimeviewPreload.image(new Image(),url);
  const texture=new THREE.Texture(img);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}
function setSpriteText(spr, text, color = '#eaf4ff', worldHeight = 1.5) {
  const px = 20, font = `500 ${px}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  const measure = document.createElement('canvas').getContext('2d'); measure.font = font;
  const w = Math.ceil(measure.measureText(text).width) + 16, h = px * 1.6;
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d'); c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 6; c.fillStyle = color; c.fillText(text, w/2, h/2);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  spr.material.map = tex; spr.material.needsUpdate = true;
  spr.scale.set(worldHeight * (w / h), worldHeight, 1);
}
function makeTextSprite(text, color = '#eaf4ff', worldHeight = 1.5) {
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map:null, transparent:true, depthTest:false, depthWrite:false }));
  spr.renderOrder = 999; setSpriteText(spr, text, color, worldHeight); return spr;
}
function makeGlowSprite() {
  const s = 256, canvas = document.createElement('canvas'); canvas.width = s; canvas.height = s;
  const c = canvas.getContext('2d');
  const g = c.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0.00,'rgba(255,248,225,1)'); g.addColorStop(0.22,'rgba(255,215,140,0.7)');
  g.addColorStop(0.55,'rgba(255,170,90,0.2)'); g.addColorStop(1.00,'rgba(255,130,50,0)');
  c.fillStyle = g; c.fillRect(0,0,s,s);
  const tex = new THREE.CanvasTexture(canvas);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true }));
  spr.scale.set(SUN_RADIUS * 5.2, SUN_RADIUS * 5.2, 1); return spr;
}

const orbitLines = [];
function makeOrbitLine(radius) {
  const pts = [], SEG = 256;
  for (let i = 0; i <= SEG; i++) { const a = (i/SEG)*Math.PI*2; pts.push(new THREE.Vector3(Math.cos(a)*radius, Math.sin(a)*radius, 0)); }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color:0x4a6a90, transparent:true, opacity:0.45 }));
  line.visible = false;
  orbitLines.push(line);
  return line;
}

/* ============ 坐标轴 ============ */
const axesGroup = new THREE.Group();
axesGroup.visible = false;
const xLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1,0,0), new THREE.Vector3(1,0,0)]), new THREE.LineBasicMaterial({ color:0xff7b7b, transparent:true, opacity:0.55 }));
const yLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,-1,0), new THREE.Vector3(0,1,0)]), new THREE.LineBasicMaterial({ color:0x6fdf6f, transparent:true, opacity:0.55 }));
const zLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,-12), new THREE.Vector3(0,0,30)]), new THREE.LineBasicMaterial({ color:0x7ba8ff, transparent:true, opacity:0.6 }));
const xLabel = makeTextSprite('X', '#ffb3b3', 1.6);
const yLabel = makeTextSprite('Y', '#b8f0b8', 1.6);
const zLabel = makeTextSprite('Z·北极', '#a0c0ff', 1.4);
axesGroup.add(xLine, yLine, zLine, xLabel, yLabel, zLabel);
worldGroup.add(axesGroup);

/* ============ 星座与星宿 ============ */
const RAD = Math.PI / 180;
const CONSTELLATIONS = [
  // 十二星座 — IAU真实星图数据（赤经赤纬→黄经黄纬换算）
  { name:'白羊座', type:'zodiac', desc:'黄道第一宫，春分点所在星座。主星娄宿三(α Ari, 2.0等)距地66光年。', stars:[[48.2,10.4,0],[37.7,10.0,0],[34.0,8.5,0],[33.2,7.2,0]], lines:[[0,1],[1,2],[2,3]] },
  { name:'金牛座', type:'zodiac', desc:'黄道第二宫，冬季最壮观星座。主星毕宿五(α Tau, 0.85等)橙红巨星距地65光年。拥有昴宿星团(M45)和毕宿星团。', stars:[[84.8,-2.2,0],[69.8,-5.5,0],[68.0,-5.8,0],[65.8,-5.7,0],[66.9,-4.0,0],[68.5,-2.6,0],[82.6,5.4,0],[60.6,-8.0,0],[51.9,-8.8,0],[59.9,-14.5,0],[51.2,-9.3,0],[52.0,-18.4,0]], lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[3,7],[7,8],[8,9],[8,10],[10,11]] },
  { name:'双子座', type:'zodiac', desc:'黄道第三宫，冬季星座。北河三(β Gem, 1.14等)和北河二(α Gem, 1.93等)为标志性双星。', stars:[[93.4,-0.9,0],[95.3,-0.8,0],[99.9,2.1,0],[105.4,7.8,0],[110.2,10.1,0],[113.2,6.7,0],[111.3,5.2,0],[108.5,-0.2,0],[105.0,-2.0,0],[99.1,-6.7,0],[101.2,-10.1,0],[108.8,-5.6,0]], lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[7,11]] },
  { name:'巨蟹座', type:'zodiac', desc:'黄道第四宫，较暗星座。含蜂巢星团(M44/Praesepe)，距地577光年。', stars:[[133.6,-5.1,0],[128.7,0.1,0],[127.5,3.2,0],[126.3,10.4,0],[124.3,-10.3,0]], lines:[[0,1],[1,2],[2,3],[1,4]] },
  { name:'狮子座', type:'zodiac', desc:'黄道第五宫，春季主角。主星轩辕十四(α Leo, 1.35等)蓝白矮星距地79光年。镰刀形状醒目。', stars:[[149.8,0.5,0],[147.9,4.9,0],[149.6,8.8,0],[161.3,14.3,0],[171.6,12.3,0],[163.4,9.7,0],[147.6,11.9,0],[141.4,12.3,0],[140.7,9.7,0]], lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[2,6],[6,7],[7,8]] },
  { name:'室女座', type:'zodiac', desc:'黄道第六宫，全天第二大星座。主星角宿一(α Vir, 0.98等)蓝白巨星距地250光年，春季大三角之一。', stars:[[174.2,4.6,0],[177.2,0.7,0],[184.8,1.4,0],[190.1,2.8,0],[198.2,1.7,0],[203.8,-2.1,0],[213.8,7.2,0],[220.1,9.7,0],[189.9,16.2,0],[191.5,8.6,0],[202.1,8.6,0],[207.7,13.1,0],[218.5,17.1,0]], lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[8,9],[9,3],[4,10],[10,11],[11,12]] },
  { name:'天秤座', type:'zodiac', desc:'黄道第七宫，唯一非动物命名星座。氐宿四(β Lib, 2.62等)和氐宿一(α Lib, 2.75等)。', stars:[[230.7,-7.6,0],[225.1,0.3,0],[229.4,8.5,0],[235.1,4.4,0],[238.6,-8.5,0],[239.4,-10.0,0]], lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[1,3]] },
  { name:'天蝎座', type:'zodiac', desc:'黄道第八宫，夏季南天最壮观星座。主星心宿二(α Sco, 0.96等)红超巨星直径约太阳883倍。蝎尾醒目。', stars:[[242.9,-5.5,0],[242.6,-2.0,0],[243.2,1.0,0],[247.8,-4.0,0],[249.8,-4.6,0],[251.5,-6.1,0],[255.3,-11.7,0],[256.2,-15.4,0],[257.2,-19.6,0],[260.7,-20.2,0],[265.6,-19.6,0],[267.5,-16.7,0],[266.5,-15.6,0],[264.6,-13.8,0]], lines:[[0,1],[1,2],[1,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13]] },
  { name:'人马座', type:'zodiac', desc:'黄道第九宫，银河系中心方向。茶壶形状醒目。银河系中心距地26000光年。', stars:[[273.6,-13.4,0],[275.1,-11.1,0],[274.6,-6.5,0],[276.3,-2.1,0],[273.2,2.3,0],[285.8,-22.1,0],[286.6,-18.4,0],[283.6,-7.2,0],[280.2,-4.0,0],[292.6,-20.7,0],[294.9,-14.4,0],[295.9,-5.4,0],[291.8,-3.3,0],[289.3,-2.5,0],[287.0,-2.9,0],[282.4,-3.4,0],[271.3,-7.0,0],[284.8,-5.1,0],[285.0,0.9,0],[286.3,1.4,0],[288.3,3.3,0],[289.5,4.2,0],[289.7,6.1,0],[283.5,1.7,0],[282.5,0.1,0]], lines:[[0,1],[1,2],[2,3],[3,4],[5,6],[6,7],[7,8],[8,3],[9,10],[10,11],[11,12],[12,13],[13,14],[14,15],[15,8],[8,2],[2,16],[16,1],[1,7],[7,17],[17,15],[15,18],[18,19],[19,20],[20,21],[21,22],[18,23],[23,24],[24,15]] },
  { name:'摩羯座', type:'zodiac', desc:'黄道第十宫，秋季星座。形似海山羊——上半身羊下半身鱼。垒壁阵四(δ Cap, 2.85等)。', stars:[[303.8,7.0,0],[304.0,4.6,0],[305.2,1.2,0],[307.2,-7.0,0],[308.0,-9.0,0],[316.9,-7.0,0],[323.5,-2.6,0],[321.8,-2.6,0],[317.7,-1.4,0],[313.8,-0.6,0]], lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,0]] },
  { name:'宝瓶座', type:'zodiac', desc:'黄道第十一宫，秋季星座。虚宿一(β Aqr, 2.91等)和危宿一(α Aqr, 2.96等)为最亮星。', stars:[[311.7,8.1,0],[313.1,8.2,0],[323.4,8.6,0],[333.4,10.7,0],[336.7,8.2,0],[338.9,8.8,0],[340.4,8.1,0],[341.6,-0.4,0],[346.7,-4.3,0],[340.0,-14.5,0],[328.7,-2.1,0],[333.3,2.7,0],[338.6,10.5,0],[343.5,-14.8,0],[348.6,-14.5,0]], lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[2,10],[3,11],[5,12],[13,8],[8,14]] },
  { name:'双鱼座', type:'zodiac', desc:'黄道第十二宫，秋季星座。由两条鱼用丝带连接。春分点因岁差已移至双鱼座。', stars:[[26.5,15.5,0],[28.3,20.7,0],[28.8,17.5,0],[24.5,12.4,0],[26.8,5.4,0],[27.7,-1.6,0],[29.4,-9.1,0],[27.5,-7.9,0],[25.5,-4.7,0],[23.1,-3.1,0],[19.9,-0.2,0],[17.5,1.1,0],[14.1,2.2,0],[2.6,6.4,0],[357.6,7.2,0],[355.2,9.0,0],[353.0,8.9,0],[351.5,7.3,0],[352.9,4.4,0],[356.6,3.4,0],[358.3,4.6,0],[348.6,9.1,0]], lines:[[0,1],[1,2],[2,0],[0,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13],[13,14],[14,15],[15,16],[16,17],[17,18],[18,19],[19,20],[20,14],[17,21]] },

  // 二十八星宿 — IAU中国传统星宿数据（d3-celestial中文星官数据）
  // 东方青龙七宿
  { name:'角宿', type:'xiusu', desc:'东方青龙第一宿，龙角。主星角宿一(Spica, α Vir, 0.98等)蓝白巨星距地250光年。春季大三角之一。主刑罚法令。', stars:[[203.8,-2.1,0],[202.1,8.6,0]], lines:[[0,1]] },
  { name:'亢宿', type:'xiusu', desc:'东方青龙第二宿，龙颈。主星亢宿一(κ Vir, 4.19等)。共4星在室女座西部。主疾病诉讼。', stars:[[214.5,2.9,0],[213.8,7.2,0],[215.5,11.8,0],[217.0,0.5,0]], lines:[[0,1],[1,2],[0,3]] },
  { name:'氐宿', type:'xiusu', desc:'东方青龙第三宿，龙胸。主星氐宿一(α Lib, 2.75等)和氐宿四(β Lib, 2.62等)。主天子行宫。', stars:[[225.1,0.3,0],[231.0,-1.8,0],[235.1,4.4,0],[229.4,8.5,0]], lines:[[0,1],[1,2],[2,3]] },
  { name:'房宿', type:'xiusu', desc:'东方青龙第四宿，龙腹。主星房宿一(β Sco, 2.62等)。天子明堂，主政令。', stars:[[243.2,1.0,0],[242.6,-2.0,0],[242.9,-5.5,0],[243.1,-8.6,0]], lines:[[0,1],[1,2],[2,3]] },
  { name:'心宿', type:'xiusu', desc:'东方青龙第五宿，龙心。主星心宿二(Antares, α Sco, 0.96等)红超巨星。七月流火即指大火星西沉。', stars:[[247.8,-4.0,0],[249.8,-4.6,0],[251.5,-6.1,0]], lines:[[0,1],[1,2]] },
  { name:'尾宿', type:'xiusu', desc:'东方青龙第六宿，龙尾。主星尾宿八(λ Sco, 1.63等)。9星弧形如龙尾摆动。主后宫。', stars:[[255.3,-11.7,0],[256.2,-15.4,0],[257.1,-19.7,0],[260.7,-20.2,0],[265.6,-19.6,0],[267.5,-16.7,0],[266.5,-15.6,0],[264.6,-13.8,0],[264.0,-14.0,0]], lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8]] },
  { name:'箕宿', type:'xiusu', desc:'东方青龙第七宿，龙尾末梢。主星箕宿一(γ Sgr, 2.99等)。形似簸箕。古代与风有关。', stars:[[271.3,-7.0,0],[274.6,-6.5,0],[275.1,-11.1,0],[273.6,-13.4,0]], lines:[[0,1],[1,2],[2,3]] },

  // 北方玄武七宿
  { name:'斗宿', type:'xiusu', desc:'北方玄武第一宿，龟蛇之斗。主星斗宿一(φ Sgr, 3.17等)。6星排列如斗形即南斗六星。', stars:[[273.2,2.3,0],[276.3,-2.1,0],[280.2,-4.0,0],[282.4,-3.4,0],[284.8,-5.1,0],[283.6,-7.2,0]], lines:[[0,1],[1,2],[2,3],[3,4],[4,5]] },
  { name:'牛宿', type:'xiusu', desc:'北方玄武第二宿，牵牛。主星牛宿一(β Cap, 3.08等)。与织女星隔银河相望。主祭祀。', stars:[[304.0,4.6,0],[303.9,6.9,0],[302.5,7.2,0],[304.7,0.9,0],[305.2,0.4,0],[305.2,1.2,0]], lines:[[0,1],[1,2],[0,3],[3,4],[4,5],[3,5]] },
  { name:'女宿', type:'xiusu', desc:'北方玄武第三宿，织女。主星女宿一(ε Aqr, 3.77等)。主布帛、裁缝、珍宝。', stars:[[311.7,8.1,0],[313.1,8.2,0],[313.7,11.6,0],[313.0,12.4,0]], lines:[[0,1],[1,2],[2,3]] },
  { name:'虚宿', type:'xiusu', desc:'北方玄武第四宿，虚空。主星虚宿一(β Aqr, 2.91等)。古代秋分点所在。主死丧、哭泣。', stars:[[323.4,8.6,0],[323.1,20.1,0]], lines:[[0,1]] },
  { name:'危宿', type:'xiusu', desc:'北方玄武第五宿，屋脊。主星危宿一(α Aqr, 2.96等)。主架屋、建造。', stars:[[333.4,10.7,0],[336.8,16.3,0],[331.9,22.1,0]], lines:[[0,1],[1,2]] },
  { name:'室宿', type:'xiusu', desc:'北方玄武第六宿，营室。主星室宿一(α Peg, 2.49等)。飞马座大四边形。主军营。', stars:[[353.5,19.4,0],[359.4,31.1,0]], lines:[[0,1]] },
  { name:'壁宿', type:'xiusu', desc:'北方玄武第七宿，墙壁。主星壁宿一(γ Peg, 2.83等)。古代图书之府。主文章。', stars:[[9.2,12.6,0],[14.3,25.7,0]], lines:[[0,1]] },

  // 西方白虎七宿
  { name:'奎宿', type:'xiusu', desc:'西方白虎第一宿，虎尾。主星奎宿一(η And, 4.42等)。16星是二十八宿中星数最多的。主武库兵甲。', stars:[[22.4,15.9,0],[20.6,17.6,0],[22.6,20.5,0],[20.9,23.0,0],[21.8,24.4,0],[22.7,27.1,0],[29.1,32.6,0],[29.2,29.7,0],[30.4,25.9,0],[28.1,23.1,0],[28.3,20.7,0],[29.8,18.7,0],[28.8,17.5,0],[26.5,15.5,0],[24.5,12.4,0],[23.4,13.4,0]], lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13],[13,14],[14,15],[15,0]] },
  { name:'娄宿', type:'xiusu', desc:'西方白虎第二宿，聚众。主星娄宿一(β Ari, 2.64等)。春分点附近重要星宿。主兴兵聚众。', stars:[[37.7,10.0,0],[34.0,8.5,0],[33.2,7.2,0]], lines:[[0,1],[1,2]] },
  { name:'胃宿', type:'xiusu', desc:'西方白虎第三宿，粮仓。主星胃宿一(35 Ari, 约4.6等)。主仓廪、收藏。', stars:[[46.9,11.3,0],[48.4,12.5,0],[48.2,10.4,0]], lines:[[0,1],[1,2]] },
  { name:'昴宿', type:'xiusu', desc:'西方白虎第四宿，即著名的昴宿星团(M45/七姐妹星团)。距地444光年。主狱事。', stars:[[59.4,4.2,0],[59.6,4.5,0],[59.7,4.6,0],[59.7,4.4,0],[59.7,4.0,0],[60.0,4.1,0],[60.4,3.9,0]], lines:[[0,1],[1,2],[2,3],[0,4],[4,5],[5,6]] },
  { name:'毕宿', type:'xiusu', desc:'西方白虎第五宿，猎网。主星毕宿五(Aldebaran, α Tau, 0.85等)橙红巨星距地65光年。主边兵。', stars:[[68.5,-2.6,0],[67.5,-3.7,0],[66.9,-4.0,0],[65.8,-5.7,0],[69.8,-5.5,0],[68.0,-5.7,0],[67.4,-6.0,0],[60.6,-8.0,0],[70.5,-6.2,0]], lines:[[0,1],[1,2],[2,3],[4,5],[5,6],[6,3],[3,7],[4,8]] },
  { name:'觜宿', type:'xiusu', desc:'西方白虎第六宿，鸟嘴。主星觜宿一(λ Ori, 3.54等)。位于猎户座头部。主军旅、刑罚。', stars:[[83.7,-13.4,0],[83.6,-13.8,0],[84.1,-14.0,0]], lines:[[0,1],[0,2]] },
  { name:'参宿', type:'xiusu', desc:'西方白虎第七宿。主星参宿四(Betelgeuse, 0.5等红超巨星)和参宿七(Rigel, 0.13等蓝白超巨星)。冬季最壮观星宿。主斩刈杀伐。', stars:[[88.8,-16.0,0],[84.7,-25.3,0],[83.5,-24.5,0],[82.4,-23.6,0],[76.8,-31.1,0],[80.9,-16.8,0],[86.4,-33.1,0]], lines:[[0,1],[1,2],[2,3],[3,4],[3,5],[1,6]] },

  // 南方朱雀七宿
  { name:'井宿', type:'xiusu', desc:'南方朱雀第一宿，水井。主星井宿一(μ Gem, 2.88等)。8星井字形。主水事、法令。', stars:[[108.8,-5.6,0],[105.0,-2.0,0],[102.0,-1.1,0],[99.9,2.1,0],[96.8,-3.1,0],[95.3,-0.8,0],[99.1,-6.7,0],[101.2,-10.1,0],[93.4,-0.9,0]], lines:[[0,1],[1,2],[2,3],[2,4],[4,5],[4,6],[6,1],[6,7],[5,8]] },
  { name:'鬼宿', type:'xiusu', desc:'南方朱雀第二宿，鬼魂。主星鬼宿一(θ Cnc, 5.35等)。中间有蜂巢星团(M44)。主祭祀。', stars:[[125.7,-0.8,0],[125.4,1.6,0],[127.5,3.2,0],[128.7,0.1,0]], lines:[[0,1],[1,2],[2,3]] },
  { name:'柳宿', type:'xiusu', desc:'南方朱雀第三宿，柳树。主星柳宿一(δ Hya, 4.16等)。8星如柳枝垂下。主厨宰。', stars:[[131.2,-14.6,0],[132.3,-14.3,0],[132.9,-11.6,0],[132.3,-11.1,0],[130.3,-12.4,0],[134.6,-11.0,0],[137.4,-11.0,0],[140.3,-13.1,0]], lines:[[0,1],[1,2],[2,3],[4,3],[2,5],[5,6],[6,7]] },
  { name:'星宿', type:'xiusu', desc:'南方朱雀第四宿，七星。主星星宿一(Alphard, α Hya, 1.98等)橙色巨星距地177光年。主衣裳。', stars:[[147.3,-22.4,0],[145.6,-16.7,0],[145.7,-15.0,0],[147.6,-14.3,0],[145.8,-23.8,0],[146.5,-26.2,0],[149.0,-23.8,0]], lines:[[0,1],[1,2],[2,3],[0,4],[4,5],[5,6],[0,6]] },
  { name:'张宿', type:'xiusu', desc:'南方朱雀第五宿，张开的弓。主星张宿一(υ1 Hya, 4.12等)。主天厨、赏赐。', stars:[[155.7,-26.1,0],[159.4,-22.0,0],[165.0,-24.7,0],[160.2,-27.9,0],[152.7,-26.6,0],[168.0,-23.5,0]], lines:[[0,1],[1,2],[2,3],[0,3],[0,4],[2,5]] },
  { name:'翼宿', type:'xiusu', desc:'南方朱雀第六宿，鸟翼。主星翼宿一(α Crt, 4.08等)。22星象征朱雀展翅。主远行、宴会。', stars:[[173.7,-22.7,0],[179.2,-19.7,0],[179.4,-20.8,0],[170.4,-21.8,0],[184.1,-18.3,0],[186.1,-16.1,0],[176.7,-17.6,0],[180.5,-14.2,0],[177.5,-14.6,0],[176.2,-13.5,0],[171.9,-15.6,0],[170.8,-14.9,0],[178.6,-11.3,0],[181.5,-10.6,0],[178.6,-25.6,0],[182.2,-21.8,0],[179.3,-30.3,0],[185.7,-24.6,0]], lines:[[0,1],[0,2],[0,3],[1,4],[4,2],[4,5],[1,6],[6,7],[7,8],[8,9],[9,10],[10,11],[9,12],[12,13],[2,14],[14,15],[15,16],[16,17]] },
  { name:'轸宿', type:'xiusu', desc:'南方朱雀第七宿，车轮。主星轸宿一(γ Crv, 2.59等)。南方朱雀之尾、二十八宿之末。主车骑。', stars:[[197.4,-18.0,0],[193.5,-12.2,0],[190.7,-14.5,0],[191.7,-19.7,0],[193.8,-18.3,0],[193.8,-11.7,0],[192.2,-21.7,0]], lines:[[0,1],[1,2],[2,3],[2,4],[1,5],[3,6]] }
];

const R_CST = 108; // 教学星空球紧邻冥王星轨道外侧，保留恒星角位置。
const constellationGroup = new THREE.Group();
const zodiacLinesMat = new THREE.LineBasicMaterial({ color:0xffcc44, transparent:true, opacity:0.6 });
const xiusuLinesMat = new THREE.LineBasicMaterial({ color:0x66bbff, transparent:true, opacity:0.5 });
const zodiacStarMat = new THREE.PointsMaterial({ color:0xffcc44, size:2.5, sizeAttenuation:true, transparent:true, opacity:0.9 });
const xiusuStarMat = new THREE.PointsMaterial({ color:0x66bbff, size:2, sizeAttenuation:true, transparent:true, opacity:0.8 });
const _tmpV = new THREE.Vector3();
const zodiacGroup = new THREE.Group();
zodiacGroup.visible = false;
const xiusuGroup = new THREE.Group();
const constellationLabels = [];
const constellationClickTargets = []; // { pos, data }

function eclipticToXYZ(lonDeg, latDeg, r) {
  const lon = lonDeg * RAD, lat = latDeg * RAD;
  return new THREE.Vector3(Math.cos(lat)*Math.cos(lon)*r, Math.cos(lat)*Math.sin(lon)*r, Math.sin(lat)*r);
}

for (const c of CONSTELLATIONS) {
  const group = c.type === 'zodiac' ? zodiacGroup : xiusuGroup;
  const linesMat = c.type === 'zodiac' ? zodiacLinesMat : xiusuLinesMat;
  const starMat = c.type === 'zodiac' ? zodiacStarMat : xiusuStarMat;

  // 星星
  const starPositions = [];
  for (const s of c.stars) {
    const p = eclipticToXYZ(s[0], s[1], R_CST);
    starPositions.push(p.x, p.y, p.z);
  }
  const starsGeo = new THREE.BufferGeometry();
  starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  group.add(new THREE.Points(starsGeo, starMat));

  // 连线
  const linePositions = [];
  for (const l of c.lines) {
    const p0 = eclipticToXYZ(c.stars[l[0]][0], c.stars[l[0]][1], R_CST);
    const p1 = eclipticToXYZ(c.stars[l[1]][0], c.stars[l[1]][1], R_CST);
    linePositions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
  }
  const linesGeo = new THREE.BufferGeometry();
  linesGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  group.add(new THREE.LineSegments(linesGeo, linesMat));

  // 标签（HTML）
  let cx = 0, cy = 0, cz = 0;
  for (const s of c.stars) { const p = eclipticToXYZ(s[0], s[1], R_CST); cx += p.x; cy += p.y; cz += p.z; }
  cx /= c.stars.length; cy /= c.stars.length; cz /= c.stars.length;
  const labelPos = new THREE.Vector3(cx, cy, cz);
  const el = document.createElement('div'); el.className = 'plabel';
  const color = c.type === 'zodiac' ? '#ffdd77' : '#88ccff';
  el.innerHTML = `<span class="name" style="color:${color};cursor:pointer">${c.name}</span>`;
  el.style.pointerEvents = 'auto';
  dom.getElementById('skyLabelsLayer').appendChild(el);
  constellationLabels.push({ el, pos: labelPos, group });
  constellationClickTargets.push({ pos: labelPos.clone(), data: c, el });
}

constellationGroup.add(zodiacGroup);
constellationGroup.add(xiusuGroup);
xiusuGroup.visible = false;
worldGroup.add(constellationGroup);

let zodiacOn = false, xiusuOn = false;

// 发光纹理生成
function makeGlow(r, g, b) {
  const s = 128, canvas = document.createElement('canvas'); canvas.width = s; canvas.height = s;
  const c = canvas.getContext('2d');
  const grad = c.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.3, `rgba(${r},${g},${b},0.5)`);
  grad.addColorStop(0.7, `rgba(${r},${g},${b},0.1)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  c.fillStyle = grad; c.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(canvas);
}

/* ============ 三体星系 ============ */
const THREEBODY_DIST = 180; // 距太阳的距离（视觉单位）
const threeBodyGroup = new THREE.Group();
threeBodyGroup.position.set(THREEBODY_DIST * 0.7, THREEBODY_DIST * 0.5, THREEBODY_DIST * 0.3);

// 三颗恒星
const tbStarA = new THREE.Mesh(
  new THREE.SphereGeometry(2.2, 32, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff4e0 })
);
const tbGlowA = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow(255, 244, 224), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false
}));
tbGlowA.scale.set(12, 12, 1);

const tbStarB = new THREE.Mesh(
  new THREE.SphereGeometry(1.6, 32, 24),
  new THREE.MeshBasicMaterial({ color: 0xffd090 })
);
const tbGlowB = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow(255, 208, 144), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false
}));
tbGlowB.scale.set(8, 8, 1);

const tbStarC = new THREE.Mesh(
  new THREE.SphereGeometry(0.8, 32, 24),
  new THREE.MeshBasicMaterial({ color: 0xff6040 })
);
const tbGlowC = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow(255, 96, 64), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false
}));
tbGlowC.scale.set(5, 5, 1);

threeBodyGroup.add(tbStarA, tbGlowA, tbStarB, tbGlowB, tbStarC, tbGlowC);
worldGroup.add(threeBodyGroup);

// 三体标签
const tbLabelA = makeTextSprite('南门二A', '#fff4e0', 3.0);
const tbLabelB = makeTextSprite('南门二B', '#ffd090', 3.0);
const tbLabelC = makeTextSprite('比邻星 · 轨道加速演示', '#ff9e80', 2.8);
threeBodyGroup.add(tbLabelA, tbLabelB, tbLabelC);

// Each Kepler orbit is accelerated separately so the outer orbit is observable.
const tbModel = window.TimeviewThreeBody;
const tbInnerOrbits = new THREE.Group();
threeBodyGroup.add(tbInnerOrbits);
function makeTBOrbit(elements, scale, color, parent) {
  const points = [];
  for (let i=0;i<384;i++) {
    const v=tbModel.orbit(elements, i/384*elements.period);
    points.push(new THREE.Vector3(...v).multiplyScalar(scale));
  }
  const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({color,transparent:true,opacity:0.4}));
  parent.add(line);return line;
}
const tbOrbitA=makeTBOrbit(tbModel.inner, -0.45*12/tbModel.inner.axis, 0xfff4e0, tbInnerOrbits);
const tbOrbitB=makeTBOrbit(tbModel.inner, 0.55*12/tbModel.inner.axis, 0xffd090, tbInnerOrbits);
const tbOrbitC=makeTBOrbit(tbModel.outer, 2/2.122*42/tbModel.outer.axis, 0xff6040, threeBodyGroup);
let threeBodyOn = false;
threeBodyGroup.visible = false;
let tbYears = 0;
let tbOuterYears = 0;
function placeThreeBody() {
  const state=tbModel.state(tbYears,true,tbOuterYears);
  [tbStarA,tbStarB,tbStarC].forEach((star,i)=>star.position.fromArray(state.positions[i]));
  [tbGlowA,tbGlowB,tbGlowC].forEach((glow,i)=>glow.position.fromArray(state.positions[i]));
  [tbLabelA,tbLabelB,tbLabelC].forEach((label,i)=>{
    label.position.fromArray(state.positions[i]);label.position.y += [3.5,3,2.5][i];
  });
  tbInnerOrbits.position.fromArray(state.center);
}
function updateThreeBody(dt) {
  if (!threeBodyOn) return;
  if (!paused) { tbYears += dt*8; tbOuterYears += dt*tbModel.outer.period/45; }
  placeThreeBody();
}
placeThreeBody();

/* ============ 旅行者号探测器 ============ */
const VGER1_DIST = 140;  // 旅行者1号当前视觉距离
const VGER2_DIST = 134;  // 旅行者2号当前视觉距离

// 旅行者号速度（AU/年）→ 视觉单位/毫秒
const AU_YEAR_MS = 365.25 * 86400 * 1000;
const VGER1_AU_PER_YEAR = 3.6;
const VGER2_AU_PER_YEAR = 3.2;
const VGER1_LAUNCH = Date.UTC(1977, 8, 5);  // 1977-09-05
const VGER2_LAUNCH = Date.UTC(1977, 7, 20); // 1977-08-20
const VGER_VIS_PER_AU = VGER1_DIST / 165;   // 视觉单位/AU

// 方向（投影到黄道面）
const vger1Dir = new THREE.Vector3(Math.cos(257.5 * RAD), Math.sin(257.5 * RAD), 0).normalize();
const vger2Dir = new THREE.Vector3(Math.cos(299.0 * RAD), Math.sin(299.0 * RAD), 0).normalize();

// 旅行者号纹理
function makeVoyagerTex() {
  const s = 128, c = document.createElement('canvas'); c.width = s; c.height = s;
  const x = c.getContext('2d');
  x.translate(s/2, s/2);
  x.beginPath(); x.ellipse(0, -8, 30, 22, 0, 0, Math.PI*2);
  const dg = x.createRadialGradient(0, -12, 2, 0, -8, 30);
  dg.addColorStop(0, '#ffe8a0'); dg.addColorStop(0.5, '#d4a040'); dg.addColorStop(1, '#a07020');
  x.fillStyle = dg; x.fill();
  x.strokeStyle = '#c89030'; x.lineWidth = 1.5; x.stroke();
  x.strokeStyle = '#888'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(0, 14); x.lineTo(0, 30); x.stroke();
  x.strokeStyle = '#999'; x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(-2, 14); x.lineTo(-40, 40); x.stroke();
  x.beginPath(); x.moveTo(2, 14); x.lineTo(35, 38); x.stroke();
  x.fillStyle = '#666';
  x.fillRect(-8, 30, 5, 10); x.fillRect(3, 30, 5, 10);
  x.fillStyle = '#888';
  x.fillRect(-8, 28, 5, 3); x.fillRect(3, 28, 5, 3);
  x.fillStyle = '#777'; x.fillRect(-6, 14, 12, 6);
  return new THREE.CanvasTexture(c);
}
const vgerTex = makeVoyagerTex();

// 创建旅行者号对象（轨迹 + 标记 + 标签）
function createVoyager(dir, dist, label, color, glowColor, trailColor) {
  const group = new THREE.Group();
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: vgerTex, transparent: true, depthTest: false }));
  marker.scale.set(4, 4, 1);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlow(glowColor[0], glowColor[1], glowColor[2]), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  glow.scale.set(5, 5, 1);
  group.add(glow, marker);
  group.position.copy(dir).multiplyScalar(dist);
  worldGroup.add(group);

  const labelSprite = makeTextSprite(label, color, 1.3);
  labelSprite.position.set(0, 3.5, 0);
  group.add(labelSprite);

  // 直线轨迹（从太阳附近到当前位置）
  const trailGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    group.position.clone()
  ]);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: trailColor, transparent: true, opacity: 0.3 }));
  worldGroup.add(trail);

  // 距离标记（点击时显示）
  const distLabel = makeTextSprite('', '#ffffff', 1.0);
  distLabel.visible = false;
  group.add(distLabel);

  sphereMap.set(marker, label === '旅行者1号' ? 'voyager1' : 'voyager2');

  return { group, marker, trail, distLabel, dir, color };
}

const vger1 = createVoyager(vger1Dir, VGER1_DIST, '旅行者1号', '#ffcc44', [255, 204, 68], 0xffcc44);
const vger2 = createVoyager(vger2Dir, VGER2_DIST, '旅行者2号', '#66ccff', [102, 204, 255], 0x66ccff);
vger1.group.visible = false; vger2.group.visible = false; vger1.trail.visible = false; vger2.trail.visible = false;

// 旅行者号位置随时间更新
function updateVoyagers() {
  const now = EPOCH_MS + simElapsed * 1000;
  // 旅行者1号
  const v1Years = (now - VGER1_LAUNCH) / AU_YEAR_MS;
  const v1AU = Math.max(0, v1Years * VGER1_AU_PER_YEAR);
  const v1Vis = v1AU * VGER_VIS_PER_AU;
  vger1.group.position.copy(vger1Dir).multiplyScalar(v1Vis);
  // 更新轨迹
  const v1Pts = vger1.trail.geometry.attributes.position;
  v1Pts.setXYZ(0, 0, 0, 0);
  v1Pts.setXYZ(1, vger1.group.position.x, vger1.group.position.y, vger1.group.position.z);
  v1Pts.needsUpdate = true;
  // 距离标签
  vger1.distLabel.position.set(0, 5, 0);
  setSpriteText(vger1.distLabel, v1AU.toFixed(1) + ' AU', '#ffcc44', 1.0);

  // 旅行者2号
  const v2Years = (now - VGER2_LAUNCH) / AU_YEAR_MS;
  const v2AU = Math.max(0, v2Years * VGER2_AU_PER_YEAR);
  const v2Vis = v2AU * VGER_VIS_PER_AU;
  vger2.group.position.copy(vger2Dir).multiplyScalar(v2Vis);
  const v2Pts = vger2.trail.geometry.attributes.position;
  v2Pts.setXYZ(0, 0, 0, 0);
  v2Pts.setXYZ(1, vger2.group.position.x, vger2.group.position.y, vger2.group.position.z);
  v2Pts.needsUpdate = true;
  vger2.distLabel.position.set(0, 5, 0);
  setSpriteText(vger2.distLabel, v2AU.toFixed(1) + ' AU', '#66ccff', 1.0);
}

// 旅行者信息卡

// 旅行者信息卡
const VGER_INFO = {
  1: {
    name: '旅行者1号', en: 'Voyager 1', color: '#ffcc44',
    data: {
      '发射日期': '1977年9月5日',
      '当前距离': '~165 AU（约247亿公里）',
      '当前速度': '~17 km/s（远离太阳）',
      '方向': '蛇夫座方向',
      '状态': '仍在发送数据',
      '已飞越': '木星（1979）、土星（1981）'
    },
    desc: '旅行者1号是离地球最远的人造物体。1990年拍摄了著名的"暗淡蓝点"照片。2012年穿越日球层进入星际空间，是第一个进入星际空间的人造飞行器。\n\n携带的金唱片收录了地球的声音、音乐和图片，作为给可能存在的外星文明的信息。唱片上刻有地球在银河系中的位置坐标。'
  },
  2: {
    name: '旅行者2号', en: 'Voyager 2', color: '#66ccff',
    data: {
      '发射日期': '1977年8月20日',
      '当前距离': '~140 AU（约210亿公里）',
      '当前速度': '~15 km/s（远离太阳）',
      '方向': '人马座方向',
      '状态': '仍在发送数据',
      '已飞越': '木星（1979）、土星（1981）、天王星（1986）、海王星（1989）'
    },
    desc: '旅行者2号是唯一飞越过全部四颗外行星（木星、土星、天王星、海王星）的探测器。2018年也穿越了日球层进入星际空间。\n\n两个旅行者探测器各携带一块镀金铜质金唱片，包含55种语言的问候语、各种自然声音、音乐以及115张图片，描绘了地球上的生命和文化。'
  }
};

/* ============ 构建太阳系 ============ */
const textures = {};
await Promise.all(Object.keys(TEX).map(async k => { textures[k] = await loadTexture(TEX[k]); }));

// 太阳
const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 64, 48), new THREE.MeshBasicMaterial({ map: textures.sun }));
worldGroup.add(sun);
worldGroup.add(makeGlowSprite());
sphereMap.set(sun, 'sun');

const objs = [];
for (const p of PLANETS) {
  const planetGroup = new THREE.Group(); worldGroup.add(planetGroup);
  const tiltGroup = new THREE.Group(); tiltGroup.rotation.x = THREE.MathUtils.degToRad(p.tilt); planetGroup.add(tiltGroup);
  // SphereGeometry's texture poles lie on Y. Bake them onto Z before applying
  // axial tilt and spin so the texture, rotation axis and ring plane agree.
  const geometry = new THREE.SphereGeometry(p.size, 48, 32).rotateX(Math.PI / 2);
  const sphere = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map:textures[p.key], roughness:0.8, metalness:0, emissive:0x222222, emissiveIntensity:0.15 }));
  tiltGroup.add(sphere);
  sphereMap.set(sphere, p.key);

  if (p.ring) {
    const inner = p.size*1.35, outer = p.size*2.2;
    const geo = new THREE.RingGeometry(inner, outer, 128, 1);
    const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos,i); const r = Math.sqrt(v.x*v.x+v.y*v.y); uv.setXY(i, (r-inner)/(outer-inner), 0.5); }
    tiltGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map:textures.ring, side:THREE.DoubleSide, transparent:true, opacity:0.95, depthWrite:false })));
  }
  worldGroup.add(makeOrbitLine(p.orbit));
  objs.push({ p, planetGroup, tiltGroup, sphere });
}

/* 创建 HTML 标签（圆点 + 横线 + 文字） */
const labelsLayer = dom.getElementById('labelsLayer');
const labelEls = {};
for (const o of objs) {
  const el = document.createElement('div'); el.className = 'plabel';
  el.innerHTML = `<span class="name">${o.p.name}</span>`;
  labelsLayer.appendChild(el);
  labelEls[o.p.key] = el;
}

/* 节气（HTML 标签，不随缩放变化） */
const EARTH_ORBIT = PLANETS.find(p => p.key === 'earth').orbit;
const termLabelEls = [];
const _projV = new THREE.Vector3();
const termLabelsLayer=document.createElement('div');termLabelsLayer.id='termLabelsLayer';root.appendChild(termLabelsLayer);
for (const [index,name] of SOLAR_TERMS.entries()) {
  const a = THREE.MathUtils.degToRad(index*15), r = EARTH_ORBIT + 6;
  const worldPos = new THREE.Vector3(Math.cos(a)*r, Math.sin(a)*r, 0);
  const el = document.createElement('div'); el.className = 'plabel term-label';el.dataset.term=String(index);
  el.innerHTML = `<span class="name">${name}</span>`;
  el.style.display = termsOn ? '' : 'none';
  termLabelsLayer.appendChild(el);
  termLabelEls.push({ el, worldPos, index });
}
const earthObj = objs.find(o => o.p.key === 'earth');
// Keep the Earth's axial tilt visible without reference-plane rings.
const earthGuides = new THREE.Group();earthGuides.visible=false;
if (earthObj) {
  // A thin cylinder gives a reliable width on desktop WebGL, where lineWidth
  // is commonly limited to one pixel. Its center still follows the true axis.
  const axisGeometry=new THREE.CylinderGeometry(0.045,0.045,10.4,12);
  axisGeometry.rotateX(Math.PI/2);
  const axisLine=new THREE.Mesh(axisGeometry,new THREE.MeshBasicMaterial({color:0xe9a6ff}));
  earthGuides.add(axisLine);
  earthObj.tiltGroup.add(earthGuides);
}

/* ============ 行星位置 ============ */

function setPlanetPositions() {
  // 地球
  const earthEcliptic = sunEclipticLon();
  const earthWorldAngle = THREE.MathUtils.degToRad((-earthEcliptic + 360) % 360);
  if (earthObj) {
    earthObj.planetGroup.position.set(Math.cos(earthWorldAngle)*earthObj.p.orbit, -Math.sin(earthWorldAngle)*earthObj.p.orbit, 0);
    earthObj.sphere.rotation.z = Math.PI * 2 * ((simElapsed / (Math.abs(earthObj.p.rotHours) * 3600)) % 1);
  }
  // 其他行星
  for (const o of objs) {
    if (o.p.key === 'earth') continue;
    const rev = simElapsed / (o.p.period * SEC_PER_DAY);
    const ang = MEAN_LON_RAD[o.p.key] + Math.PI * 2 * (rev - Math.floor(rev));
    o.planetGroup.position.set(Math.cos(ang)*o.p.orbit, Math.sin(ang)*o.p.orbit, 0);
    // Tilts above 90 degrees already reverse the spin relative to the ecliptic.
    o.sphere.rotation.z = Math.PI * 2 * ((simElapsed / (Math.abs(o.p.rotHours) * 3600)) % 1);
  }
}

/* ============ 坐标轴动态长度 ============ */
function updateAxes() {
  const halfH = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  const halfW = halfH * camera.aspect;
  const reach = Math.max(110, Math.sqrt(halfH*halfH + halfW*halfW));
  const labelR = Math.min(88, reach * 0.8);
  xLine.scale.x = reach; yLine.scale.y = reach;
  xLabel.position.set(labelR, 0, 0); yLabel.position.set(0, labelR, 0);
  zLabel.position.set(0, 0, 30);
}

// Keep equinoxes/solstices visible and highlight the current term at its fixed position.
function positionLabel(el,x,y){
  const transform='translate3d('+x.toFixed(2)+'px,'+y.toFixed(2)+'px,0) translate(-50%,-100%)';
  if(el._screenTransform!==transform){el._screenTransform=transform;el.style.transform=transform;}
}
function updateTermLabels() {
  const ti=currentTermIndex();
  if(ti!==lastTermIndex) {
    lastTermIndex=ti;
    for(const t of termLabelEls)t.el.classList.toggle('active',t.index===ti);
  }
  for(const t of termLabelEls) {
    if(!termsOn||(t.index!==ti&&t.index%6!==0)){if(t.el.style.display!=='none')t.el.style.display='none';continue;}
    _projV.copy(t.worldPos).applyMatrix4(worldGroup.matrixWorld).project(camera);
    const x=(_projV.x*.5+.5)*innerWidth,y=(-_projV.y*.5+.5)*innerHeight;
    positionLabel(t.el,x,y);
    const onScreen=_projV.z>=-1&&_projV.z<=1&&x>=0&&x<=innerWidth&&y>=45&&y<=innerHeight-70;
    t.el.style.display=onScreen?'':'none';
  }
}

// Drag and release use the same orbital-time mapping, including Earth's true longitude.
function advancePlanetOrbit(key,delta) {
  const body=PLANETS.find(p=>p.key===key);
  if(!body)return;
  const target=body.key==='earth'?sunEclipticLon()+delta*180/Math.PI:null;
  simElapsed+=delta/(Math.PI*2)*body.period*SEC_PER_DAY;
  if(target!==null){
    for(let i=0;i<4;i++){
      const error=((target-sunEclipticLon()+540)%360)-180;
      simElapsed+=error/360*body.period*SEC_PER_DAY;
    }
  }
}
function updateOrbitalTime(dt) {
  if(planetDrag)return;
  if(planetInertia){
    // Integrate exponential damping, independent of the display's frame rate.
    // A manual date drag pauses playback; its release momentum still runs.
    const decay=Math.exp(-3*dt);
    advancePlanetOrbit(planetInertia.key,planetInertia.velocity*(1-decay)/3);
    planetInertia.velocity*=decay;
    if(Math.abs(planetInertia.velocity)<0.01)planetInertia=null;
  }else if(!paused&&!godMode){
    simElapsed+=SPD[scaleKey]*dt;
  }
}

// Match the ring to the rendered sphere, including course scale and camera offsets.
const godPosition=new THREE.Vector3(),godScale=new THREE.Vector3(),godCameraPosition=new THREE.Vector3();
function updateGodEffects(){
  if(!godMode)return;
  const state=planetDrag||planetInertia;
  const body=state&&objs.find(item=>item.p.key===state.key);
  if(!body){godEffects.render(null);return;}
  body.planetGroup.getWorldPosition(godPosition);
  const depth=godCameraPosition.copy(godPosition).applyMatrix4(camera.matrixWorldInverse).z;
  const radius=body.p.size*body.sphere.getWorldScale(godScale).x;
  godPosition.project(camera);
  if(depth>=-radius||godPosition.z < -1||godPosition.z > 1){godEffects.clear();return;}
  const screenRadius=radius*camera.projectionMatrix.elements[5]*innerHeight/(2*Math.sqrt(depth*depth-radius*radius));
  godEffects.render({key:state.key,name:body.p.name,x:(godPosition.x*.5+.5)*innerWidth,y:(.5-godPosition.y*.5)*innerHeight,radius:screenRadius,
    phase:planetDrag?(planetDrag.moved?'drag':'hold'):'inertia',strength:Math.min(1,Math.abs(state.velocity)/3),pointer:godPointer});
}

/* ============ 动画循环 ============ */
const clock = new THREE.Clock();
let lastTermIndex = -1;
let returnStep=null;

function animate() {
  if(!active)return;
  animationFrame=requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  // The opening fills the screen. Keep the clock advancing and leave the GPU
  // available for video decoding until the transition reveals this scene.
  if(window.introActive&&!window.introTransitioning){
    if(!paused&&!godMode&&!planetDrag)simElapsed+=SPD[scaleKey]*dt;
    return;
  }

  gestures.update();
  if(!gestures.active){
    const decay=Math.exp(-6*dt),integral=(1-decay)/6;
    spinZ+=spinZVel*integral;spinX=clamp(spinX+spinXVel*integral,-Math.PI*.49,Math.PI*.49);
    spinZVel*=decay;spinXVel*=decay;
  }
  xGroup.rotation.x=spinX;worldGroup.rotation.z=spinZ;
  updateOrbitalTime(dt);

  setPlanetPositions();
  // Advance the return camera before this frame is rendered. A separate RAF
  // can otherwise change the camera after WebKit has submitted the old frame.
  if(returnStep)returnStep(performance.now());
  updateCourseCamera();
  updateAxes();
  updateThreeBody(dt);
  if (voyagerOn) updateVoyagers();
  scene.updateMatrixWorld(true);camera.updateMatrixWorld();
  updateGodEffects();

  // 更新 HTML 标签位置
  if (labelsOn) {
    for (const o of objs) {
      const el = labelEls[o.p.key]; if (!el) continue;
      const pos = _projV.set(0, o.p.size + 0.5, 0);
      pos.applyMatrix4(o.planetGroup.matrixWorld);
      pos.project(camera);
      if (pos.z > 1) { el.style.display = 'none'; continue; }
      const sx = (pos.x * 0.5 + 0.5) * innerWidth;
      const sy = (-pos.y * 0.5 + 0.5) * innerHeight;
      if (sx < -50 || sx > innerWidth + 50 || sy < -50 || sy > innerHeight + 50) { el.style.display = 'none'; continue; }
      if(el.style.display!=='')el.style.display='';positionLabel(el,sx,sy);
    }
  }
    // Sky labels are independent of the planet-label switch.
    for (const cl of constellationLabels) {
      if(!(cl.group===zodiacGroup?zodiacOn:xiusuOn)){if(cl.el.style.display!=='none')cl.el.style.display='none';continue;}
      _projV.copy(cl.pos);
      _projV.applyMatrix4(constellationGroup.matrixWorld);
      _projV.project(camera);
      if (_projV.z > 1) { cl.el.style.display = 'none'; continue; }
      const sx = (_projV.x * 0.5 + 0.5) * innerWidth;
      const sy = (-_projV.y * 0.5 + 0.5) * innerHeight;
      if (sx < -50 || sx > innerWidth + 50 || sy < -50 || sy > innerHeight + 50) { cl.el.style.display = 'none'; continue; }
      const isZodiac = cl.group === zodiacGroup;
      const display=(isZodiac?zodiacOn:xiusuOn)?'':'none';
      if(cl.el.style.display!==display)cl.el.style.display=display;
      positionLabel(cl.el,sx,sy);
    }
  updateTermLabels();

  updateDateText();
  renderer.render(scene, camera);
}
// 初始化：所有图层默认隐藏（轨道/标签/坐标轴/节气/星座/星宿/三体星系/旅行者号）
for (const key in layerConfig) layerConfig[key].set(false);
setEarthAxis(earthAxisPreference===true);
// 课程桥接位于模块内部，所有日期均传递同一个 UTC 时间戳。
// Fit the teaching subject into the part of the scene not covered by narration.
let courseFocus = null;
let courseAxesStep = 0, courseKeepXY = false;
let courseCameraMove = null;
function cameraFrameOffset(){
  const view=camera.view;
  return view?.enabled?new THREE.Vector2(view.offsetX/view.fullWidth,view.offsetY/view.fullHeight):new THREE.Vector2();
}
function applyCameraFrame(offset){
  if(offset.lengthSq()<1e-20)camera.clearViewOffset();
  else camera.setViewOffset(innerWidth,innerHeight,offset.x*innerWidth,offset.y*innerHeight,innerWidth,innerHeight);
}
function updateCourseCamera() {
  if (!courseCameraMove) return;
  const t = Math.min(1, (performance.now() - courseCameraMove.start) / 950);
  const eased=t*t*(3-2*t);
  camera.position.lerpVectors(courseCameraMove.from, courseCameraMove.to, eased);
  applyCameraFrame(new THREE.Vector2().lerpVectors(courseCameraMove.fromFrame,courseCameraMove.toFrame,eased));
  if (t === 1) courseCameraMove = null;
}
function focusCourse(key, immediate=false, preserveMode=false) {
  if(preserveMode)gestures.cancel();else setGodMode(false);
  courseFocus = key;
  // The seasonal close-up preserves the XY top view. Tilt is measured from +Z.
  spinX = key==='earth'&&earthGuides.visible ? 0 : objs.some(body=>body.p.key===key) ? -1.1 : key==='planets'&&courseAxesStep>=3 ? -0.75 : 0;
  spinZ = key==='planets'&&courseAxesStep>=3 ? -0.35 : 0;
  spinXVel = spinZVel = 0;
  xGroup.rotation.x = spinX; worldGroup.rotation.z = spinZ;
  updateVoyagers(); scene.updateMatrixWorld(true);
  let box = new THREE.Box3(new THREE.Vector3(-90,-90,-10),new THREE.Vector3(90,90,10));
  const body=objs.find(item=>item.p.key===key);
  if(body) {
    // Fit the original body size. Invisible axial guides must not enlarge the box.
    const radius = body.p.key === 'saturn' ? body.p.size*2.5 : body.p.key === 'earth' && earthGuides.visible ? 5.2 : body.p.size;
    box.setFromCenterAndSize(body.planetGroup.getWorldPosition(new THREE.Vector3()),new THREE.Vector3(2,2,2).multiplyScalar(radius*1.5));
  }
  if (key === 'xiusu' || key === 'zodiac') box.setFromObject(key === 'xiusu' ? xiusuGroup : zodiacGroup);
  if (key === 'threeBody') box.setFromObject(threeBodyGroup).expandByScalar(4);
  if (key === 'voyager') { box.makeEmpty(); box.expandByPoint(new THREE.Vector3()); box.expandByObject(vger1.group); box.expandByObject(vger2.group); box.expandByScalar(12); }
  if (key==='planets' && courseAxesStep >= 3) {
    // 聚焦远处主题时也把太阳原点、三轴标签纳入画面。
    box.union(new THREE.Box3(new THREE.Vector3(-90,-90,-12),new THREE.Vector3(90,90,32)).applyMatrix4(worldGroup.matrixWorld));
  }
  window.TimeviewCards.layout();
  const panel = dom.querySelector('#tv-assist.on'), rect = panel?.getBoundingClientRect();
  let left=20, right=innerWidth-20, top=60, bottom=innerHeight-76;
  if(rect) { if(innerWidth<=600) bottom=rect.top-12; else if(rect.left<innerWidth/2)left=rect.right+20;else right=rect.left-20; }
  for (const card of dom.querySelectorAll('#planetCard, #threeBodyCard, #tv-course-visual')) {
    if (card.hidden || getComputedStyle(card).display === 'none') continue;
    const cr = card.getBoundingClientRect();
    if (innerWidth > 600 && cr.left > 240) right = Math.min(right, cr.left - 18);
    else if (innerWidth <= 600) top = Math.max(top, cr.bottom + 12);
  }
  const mobile=window.TimeviewMobile?.sceneRect();
  if(mobile)({left,right,top,bottom}=mobile);
  const width=Math.max(80,right-left),height=Math.max(80,bottom-top);
  const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
  const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  const distance=Math.max(size.x/(2*tan*camera.aspect*width/innerWidth),size.y/(2*tan*height/innerHeight))*1.22+size.z/2;
  const destination = new THREE.Vector3(center.x-((left+right)/innerWidth-1)*distance*tan*camera.aspect,center.y-(1-(top+bottom)/innerHeight)*distance*tan,center.z+distance);
  const framing=new THREE.Vector2();
  if(key==='earth'&&earthGuides.visible){
    // Stay directly above Earth. Moving the camera sideways to avoid desktop
    // cards makes the Z component of the axis appear as a false sideways tilt.
    destination.set(center.x,center.y,center.z+distance);
    framing.set(.5-(left+right)/(2*innerWidth),.5-(top+bottom)/(2*innerHeight));
  }
  if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) { camera.position.copy(destination);applyCameraFrame(framing);courseCameraMove=null; }
  else courseCameraMove = {from:camera.position.clone(),to:destination,fromFrame:cameraFrameOffset(),toFrame:framing,start:performance.now()};
  camera.lookAt(camera.position.x,camera.position.y,camera.position.z-1);
  camera.far=Math.max(3000,distance+size.z+1000); camera.updateProjectionMatrix();
}
function setCourseAxes(step, refocus = true) {
  if(courseKeepXY)step=Math.max(2,step);
  courseAxesStep = step;
  layerConfig.orbits.set(true); layerConfig.axes.set(step > 0);
  [xLine, xLabel].forEach(o => o.visible = step >= 1);
  [yLine, yLabel].forEach(o => o.visible = step >= 2);
  [zLine, zLabel].forEach(o => o.visible = step >= 3);
  if (refocus) focusCourse('planets');
}
function resetCourseBodies(){for(const body of objs)body.planetGroup.scale.setScalar(1);setEarthAxis(earthAxisPreference===true);}
function showCourseSeason(term){
  resetCourseBodies();cardEl.style.display='none';
  const dates={spring:'2026-03-20',summer:'2026-06-21',autumn:'2026-09-23',winter:'2026-12-22',terms:'2026-03-20'};
  const date=dates[term]||dates.spring;
  // Stop at the model's exact solar longitude, rather than the end of the
  // calendar day: at the solstices Earth and its axial projection share X=0.
  const target={spring:0,summer:90,autumn:180,winter:270,terms:0}[term]??0;
  const estimate=(Date.parse(date+'T12:00:00+08:00')-EPOCH_MS)/1000;
  let low=estimate-2*SEC_PER_DAY,high=estimate+2*SEC_PER_DAY;
  for(let i=0;i<48;i++){
    const mid=(low+high)/2,delta=(sunEclipticLon(mid)-target+540)%360-180;
    if(delta<0)low=mid;else high=mid;
  }
  simElapsed=high;paused=true;planetInertia=null;
  dom.getElementById('pPlay').textContent='▶';
  updateDateText();updateLunar();
  layerConfig.orbits.set(true);layerConfig.terms.set(true);setCourseAxes(0,false);
  setEarthAxis(earthAxisPreference??true);
  setPlanetPositions();focusCourse('earth');
}
dom.onWindow('resize',()=>{if(courseFocus&&!gestures.active)focusCourse(courseFocus,false,true);});
dom.onWindow('timeview:mobile-layout',()=>{if(window.TimeviewMobile?.active()&&courseFocus&&!gestures.active)focusCourse(courseFocus,false,true);});
function resetSolarView() {
  window.dispatchEvent(new Event('timeview:manual-view'));
  window.TimeviewCards.hide();window.TimeviewCourseVisuals?.hide();
  gestures.cancel();courseCameraMove=null;
  planetDrag=null;planetInertia=null;
  // Restore the top-down view without changing the user's axis visibility.
  courseAxesStep=0;layerConfig.orbits.set(true);
  focusCourse('planets',true);
}
dom.getElementById('pReset').addEventListener('click',resetSolarView);
const course = {
  keepAxes: (on) => {
    if(courseKeepXY===on)return;
    courseKeepXY=on;setCourseAxes(on?Math.max(2,courseAxesStep):0,false);
  },
  reset: () => {
    setGodMode(false);
    window.TimeviewCards.hide(); resetCourseBodies(); planetInertia=null;
    for (const key of ['zodiac','xiusu','threeBody','voyager','terms']) layerConfig[key].set(false);
    setCourseAxes(0,false); layerConfig.labels.set(true);
  },
  focus: focusCourse,
  time: () => EPOCH_MS + simElapsed * 1000,
  setTime: (ts) => {
    if (!Number.isFinite(ts)) throw new Error('无效日期');
    setGodMode(false);
    window.courseBeijingTime = true;
    simElapsed = (ts - EPOCH_MS) / 1000;
    dom.getElementById('pPlay').textContent = paused ? '▶' : '❚❚';
    updateDateText(); updateLunar();
  },
  now: () => dom.getElementById('pNow').click(),
  layer: (key, visible) => {
    if (visible && ['zodiac','xiusu','threeBody','voyager'].includes(key)) {
      window.TimeviewCards.hide(); resetCourseBodies();
      for (const other of ['zodiac','xiusu','threeBody','voyager']) if(other!==key)layerConfig[other].set(false);
      setCourseAxes(0,false);layerConfig.terms.set(false);
    }
    if (layerConfig[key]) layerConfig[key].set(visible);
    if (visible && key === 'threeBody') window.TimeviewCards.show(dom.getElementById('threeBodyCard'));
    if(visible && ['zodiac','xiusu','threeBody','voyager'].includes(key)){layerConfig.labels.set(true);focusCourse(key);}
  },
  axes: (step)=>{resetCourseBodies();setCourseAxes(step);},
  season: showCourseSeason,
  planet: (key) => {
    resetCourseBodies();
    const body=objs.find(item=>item.p.key===key);
    if(!body)return;
    layerConfig.orbits.set(true); layerConfig.labels.set(true);
    setCourseAxes(0,false);
    showCard(key, 20, 80, true);
    setPlanetPositions();focusCourse(key);
  },
  report: () => {
    resetCourseBodies();cardEl.style.display='none';setCourseAxes(0,false);
    layerConfig.zodiac.set(false);layerConfig.xiusu.set(true);layerConfig.labels.set(true);layerConfig.orbits.set(true);
    focusCourse('planets');
  }
};

sceneLoading.style.display='none';
function earthProjection(){
  scene.updateMatrixWorld(true);camera.updateMatrixWorld();
  const position=earthObj.sphere.getWorldPosition(new THREE.Vector3());
  const depth=-position.clone().applyMatrix4(camera.matrixWorldInverse).z;
  const scale=earthObj.sphere.getWorldScale(new THREE.Vector3()).x;
  const radius=earthObj.p.size*scale;
  if(depth<=radius)return null;
  const p=position.project(camera);
  return {x:(p.x*.5+.5)*innerWidth,y:(-.5*p.y+.5)*innerHeight,
    r:radius*camera.projectionMatrix.elements[5]*innerHeight/(2*Math.sqrt(depth*depth-radius*radius))};
}
function drawStill(){
  setPlanetPositions();xGroup.rotation.x=spinX;worldGroup.rotation.z=spinZ;
  updateAxes();scene.updateMatrixWorld(true);camera.updateMatrixWorld();renderer.render(scene,camera);
}
function transitionBounds(){
  const mobile=window.TimeviewMobile?.sceneRect();if(mobile)return mobile;
  const rect={left:24,right:innerWidth-24,top:60,bottom:innerHeight-80};
  const panel=dom.querySelector('#tv-assist.on');
  if(panel){const p=panel.getBoundingClientRect();if(p.left>innerWidth/2)rect.right=Math.min(rect.right,p.left-18);}
  return rect;
}
function earthFits(anchor,rect){
  return anchor&&anchor.x-anchor.r>=rect.left&&anchor.x+anchor.r<=rect.right&&anchor.y-anchor.r>=rect.top&&anchor.y+anchor.r<=rect.bottom;
}
let returnCamera=null;
function restoreReturnCamera(){
  if(!returnCamera)return;
  camera.position.copy(returnCamera.position);applyCameraFrame(returnCamera.framing);
  courseFocus=returnCamera.focus;courseCameraMove=null;returnCamera=null;
}
async function prepareTransitionExit({signal,isCurrent,target,onPhase=()=>{},onProgress=()=>{}}){
  const rect=transitionBounds();
  returnCamera={position:camera.position.clone(),framing:cameraFrameOffset(),focus:courseFocus};
  gestures.cancel();courseCameraMove=null;planetDrag=planetInertia=null;spinXVel=spinZVel=0;
  courseFocus=null;
  function move(duration,update){
    let elapsed=0,last=null;
    return new Promise(resolve=>{
      function stop(completed=false){
        returnStep=null;signal.removeEventListener('abort',abort);
        if(!completed)returnCamera=null;
        resolve(completed);
      }
      const abort=()=>stop(false);
      function step(now){
        if(signal.aborted||!active||!isCurrent()){stop(false);return;}
        const earth=earthObj.planetGroup.getWorldPosition(new THREE.Vector3());
        // Count displayed movement, not time spent waiting for the first frame
        // or blocked by a slow device. One long frame must not consume the zoom.
        if(last!==null)elapsed+=Math.min(64,Math.max(0,now-last));last=now;
        const t=Math.min(1,elapsed/duration),ease=t*t*(3-2*t);
        update(ease,earth);
        onProgress(t);
        if(t===1)stop(true);
      }
      signal.addEventListener('abort',abort,{once:true});
      if(signal.aborted)abort();else returnStep=step;
    });
  }
  if(!earthFits(earthProjection(),rect)){
    onPhase('locating-earth');
    const from=camera.position.clone(),fromFrame=cameraFrameOffset();
    const framing=new THREE.Vector2(.5-(rect.left+rect.right)/(2*innerWidth),.5-(rect.top+rect.bottom)/(2*innerHeight));
    if(!await move(520,(ease,earth)=>{
      const distance=Math.max(65,Math.min(220,from.z-earth.z));
      camera.position.lerpVectors(from,new THREE.Vector3(earth.x,earth.y,earth.z+distance),ease);
      applyCameraFrame(new THREE.Vector2().lerpVectors(fromFrame,framing,ease));
    }))return false;
  }
  // Every return uses a real perspective-camera approach, including when Earth
  // is already in the frame. Keep the solar renderer alive until it is close;
  // only then blend the detailed Earth map into the enlarged globe.
  const start=earthProjection(),from=camera.position.clone(),startWidth=innerWidth,startHeight=innerHeight;
  const earthStart=earthObj.planetGroup.getWorldPosition(new THREE.Vector3());
  const depthStart=from.z-earthStart.z;
  const sightline=new THREE.Vector2((earthStart.x-from.x)/depthStart,(earthStart.y-from.y)/depthStart);
  const radius=earthObj.p.size*earthObj.sphere.getWorldScale(new THREE.Vector3()).x;
  onPhase('zooming-earth');
  return move(850,(ease,earth)=>{
    const goal=(typeof target==='function'?target():target)||{x:(rect.left+rect.right)/2,y:(rect.top+rect.bottom)/2,r:Math.min(rect.right-rect.left,rect.bottom-rect.top)*.29};
    const initialRadius=start.r*innerHeight/startHeight,finalRadius=Math.max(initialRadius*1.12,goal.r*.86);
    const projectionX=camera.projectionMatrix.elements[0],projectionY=camera.projectionMatrix.elements[5];
    const screenRadius=initialRadius+(finalRadius-initialRadius)*ease;
    const distance=Math.sqrt(radius*radius+(radius*projectionY*innerHeight/(2*screenRadius))**2);
    const x=start.x*innerWidth/startWidth*(1-ease)+goal.x*ease,y=start.y*innerHeight/startHeight*(1-ease)+goal.y*ease;
    // Approach along the original sightline before centering. Keeping lateral
    // position linear while depth shrinks rapidly would stretch the globe.
    camera.position.set(earth.x-sightline.x*distance*(1-ease),earth.y-sightline.y*distance*(1-ease),earth.z+distance);
    // Compensate the off-axis projection so the same globe follows a continuous
    // screen path while the surrounding solar system grows and moves past it.
    applyCameraFrame(new THREE.Vector2(
      .5+projectionX*(earth.x-camera.position.x)/(2*distance)-x/innerWidth,
      .5-projectionY*(earth.y-camera.position.y)/(2*distance)-y/innerHeight));
  });
}
return {
  course,drawStill,prepareTransitionExit,
  transitionFrame({arriving=false}={}){
    resizeScene();courseCameraMove=null;drawStill();
    let anchor=earthProjection();
    const rect=transitionBounds();
    if(arriving&&!earthFits(anchor,rect)){
      // A previous distant-planet close-up may leave Earth outside the screen.
      // Keep its orientation, but bring Earth into a usable overview before landing.
      const position=earthObj.planetGroup.getWorldPosition(new THREE.Vector3());
      const distance=Math.max(65,camera.position.z-position.z);
      camera.position.set(position.x,position.y,position.z+distance);
      camera.lookAt(position.x,position.y,position.z);
      applyCameraFrame(new THREE.Vector2(.5-(rect.left+rect.right)/(2*innerWidth),.5-(rect.top+rect.bottom)/(2*innerHeight)));
      courseFocus=null;drawStill();anchor=earthProjection();
    }
    // Copy in the same task as render: preserveDrawingBuffer can stay disabled.
    return window.TimeviewTransition.capture(renderer.domElement,anchor);
  },
  snapshot:()=>({time:EPOCH_MS+simElapsed*1000,playing:!paused,unit:scaleKey}),
  restore(value){
    simElapsed=(value.time-EPOCH_MS)/1000;paused=!value.playing;
    scaleKey=Object.hasOwn(SPD,value.unit)?value.unit:'sec';dateDisplaySecond=null;
    dom.getElementById('pPlay').textContent=paused?'▶':'❚❚';
    dom.getElementById('spdBtn').textContent='⚡ '+SPD_LABELS[scaleKey]+' ▾';
    dom.querySelectorAll('.spd-opt').forEach(el=>el.classList.toggle('on',el.dataset.u===scaleKey));
    updateDateText();updateLunar();
  },
  resume(){
    if(active)return;active=true;clock.start();resizeScene();
    setPlanetPositions();updateCourseCamera();updateAxes();animate();
  },
  suspend(){active=false;cancelAnimationFrame(animationFrame);clock.stop();setGodMode(false);planetDrag=planetInertia=null;spinXVel=spinZVel=0;restoreReturnCamera();},
  diagnostics:()=>({active,frame:animationFrame,camera:camera.position.toArray(),spin:[spinX,spinZ],interaction:godMode?'god-hand':'view',godMode,labelsOn,axesOn,termsOn,orbitsOn,earth:earthProjection()})
};

};
