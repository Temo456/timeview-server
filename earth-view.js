/* Earth scene: owns its controls and stops drawing while detached. */
window.TimeviewSceneFactories ||= {};
window.TimeviewSceneFactories.earth = function(root, dom) {
'use strict';
let active=false, animationFrame=0;
// ========== 平台层（浏览器适配） ==========
const PLT = {
  platform: 'web',
  createImage() { return new Image(); },
  downloadFile(url, cb) { cb(url); },
  vibrate() { try { navigator.vibrate(15); } catch(e) {} },
  storage: {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch(e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch(e) {} }
  }
};

// ========== 天文算法（移植自 shared/core/astro.js） ==========
const RAD = Math.PI / 180;
// ===== 地球视角可调参数（在这里统一配置）=====
const EARTH_CFG = {
  earthScale: 0.29,      // 地球半径 = min(W,H) × 此值
  centerY: 0.50,         // 地球中心 Y 偏移（0.5=居中，越大越往下）
  moonOrbitScale: 1.20,  // 月球公转半径 = R × 此值
  moonSize: 28,          // 月球半径 px（竖屏；横屏 +2）
  clockScale: 0.20,      // 中央表盘半径 = R × 此值（0=隐藏）
  hourRingScale: 1.44,   // 时间数字距圆心 = R × 此值
  hourDotScale: 1.38,    // 时间小圆点距圆心 = R × 此值
  hourNumSize: 14,       // 时间数字字号 px
  earthGlowInner: 1,  // 地球光晕内圈 = R × 此值
  earthGlowOuter: 1,  // 地球光晕外圈 = R × 此值
  earthBorderScale: 1.001,// 地球边框圆圈 = R × 此值
  ptrTipScale: 1.05,     // 时区指针尖端距圆心 = R × 此值
  sunY: -1.5,            // 太阳 Y 偏移 = R × 此值（负=上方，约在 12 点位置）
  sunGlowScale: 0.42     // 太阳光晕半径 = R × 此值
};
const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
const SYN = 29.530588853;
const dnum = ms => (ms - J2000) / 86400e3;
const rev = x => { x %= 360; return x < 0 ? x + 360 : x; };

function sunLon(d) {
  d += 1.5;
  const w = 282.9404 + 4.70935e-5 * d, e = 0.016709 - 1.151e-9 * d;
  const M = rev(356.0470 + 0.9856002585 * d), Mr = M * RAD;
  const E = M + (e / RAD) * Math.sin(Mr) * (1 + e * Math.cos(Mr));
  const Er = E * RAD;
  return rev(Math.atan2(Math.sqrt(1 - e * e) * Math.sin(Er), Math.cos(Er) - e) / RAD + w);
}
function moonLon(d) {
  d += 1.5;
  const N = rev(125.1228 - 0.0529538083 * d), i = 5.1454,
    w = rev(318.0634 + 0.1643573223 * d), e = 0.0549, M = rev(115.3654 + 13.0649929509 * d);
  const Mr = M * RAD;
  let E = M + (e / RAD) * Math.sin(Mr) * (1 + e * Math.cos(Mr));
  for (let k = 0; k < 4; k++) { const Er = E * RAD; E = E - (E - (e / RAD) * Math.sin(Er) - M) / (1 - e * Math.cos(Er)); }
  const Er = E * RAD, xv = Math.cos(Er) - e, yv = Math.sqrt(1 - e * e) * Math.sin(Er),
    v = Math.atan2(yv, xv) / RAD, r = Math.sqrt(xv * xv + yv * yv);
  const Nr = N * RAD, vr = (v + w) * RAD, ir = i * RAD;
  const xh = r * (Math.cos(Nr) * Math.cos(vr) - Math.sin(Nr) * Math.sin(vr) * Math.cos(ir));
  const yh = r * (Math.sin(Nr) * Math.cos(vr) + Math.cos(Nr) * Math.sin(vr) * Math.cos(ir));
  return rev(Math.atan2(yh, xh) / RAD);
}
function moonPhase(d, lunarDay) {
  // 伸长：有农历日时按农历日线性映射（初一=0°在上方、十五=180°在正下方），
  // 避免真实满月落在十六/十七导致十五时月球偏出正下方
  const elAstro = rev(moonLon(d) - sunLon(d));
  const el = lunarDay != null ? ((lunarDay - 1) / 14) * 180 : elAstro;
  const illum = (1 - Math.cos(el * RAD)) / 2, age = SYN * el / 360;
  // 月相名称按农历日判断，同一天内不变
  var name;
  if (lunarDay != null) {
    name = lunarDay <= 1 ? '新月' : lunarDay <= 6 ? '峨眉月' : lunarDay <= 8 ? '上弦月' : lunarDay <= 14 ? '盈凸月' : lunarDay <= 16 ? '满月' : lunarDay <= 22 ? '亏凸月' : lunarDay <= 23 ? '下弦月' : '残月';
  } else {
    const day = age % SYN;
    name = day < 1.5 || day >= 28 ? '新月' : day < 6.5 ? '峨眉月' : day < 8.5 ? '上弦月' : day < 13.5 ? '盈凸月' : day < 16.5 ? '满月' : day < 21.5 ? '亏凸月' : day < 23.5 ? '下弦月' : '残月';
  }
  return { el, illum, age, name };
}
function moonDistKm(d) {
  d += 1.5; const M = rev(115.3654 + 13.0649929509 * d), Mr = M * RAD;
  let E = M + (0.0549 / RAD) * Math.sin(Mr);
  for (let k = 0; k < 3; k++) { const Er = E * RAD; E = E - (E - (0.0549 / RAD) * Math.sin(Er) - M) / (1 - 0.0549 * Math.cos(Er)); }
  const Er = E * RAD, xv = Math.cos(Er) - 0.0549, yv = Math.sqrt(1 - 0.0549 * 0.0549) * Math.sin(Er);
  return Math.round(60.2666 * Math.sqrt(xv * xv + yv * yv) * 6371);
}
const TERMS = ['春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至','小寒','大寒','立春','雨水','惊蛰'];
function solarTerm(d) {
  const SL = rev(sunLon(d)), i = Math.floor(SL / 15) % 24, within = SL - i * 15, perDay = 360 / 365.2422;
  return { name: TERMS[i], toNext: Math.max(1, Math.round((15 - within) / perDay)), next: TERMS[(i + 1) % 24], idx: i };
}
const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
function gzYear(y) { return GAN[(y - 4) % 10] + ZHI[(y - 4) % 12]; }
// ========== 状态 ==========
let clockManuallyPaused = false;
try { clockManuallyPaused = sessionStorage.getItem('tv-clock-paused') === '1'; } catch (_) {}
const state = { t: Date.now(), playing: !clockManuallyPaused, spd: 1000, view: 'earth', hemi: 1 };
dom.getElementById('pPlay').textContent = state.playing ? '❚❚' : '▶';
let showCities = true;
let dispT = Date.now(), anchorT = Date.now();
let tlSpan = 100, tlDrag = false, inertia = 0;
const SPD = { sec: 1000, hour: 3600e3, day: 86400e3, month: 86400e3 * 30, year: 86400e3 * 365.25 };
let curUnit = 'sec';
const TIMEZONES = [['北京','Asia/Shanghai'],['伦敦','Europe/London'],['东京','Asia/Tokyo'],['印度','Asia/Kolkata'],['中欧','Europe/Berlin'],['纽约','America/New_York'],['洛杉矶','America/Los_Angeles']].map(([city,zone])=>({city,zone,min:0,label:'',formatter:new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})}));
// Cities are time-zone reading markers; their angles match the time pointers.
function cityClock(cn,zone,star=false){return {cn,zone,star,min:0,formatter:new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})};}
const NORTH_CITIES=[cityClock('北京','Asia/Shanghai',true),cityClock('东京','Asia/Tokyo'),cityClock('纽约','America/New_York'),cityClock('莫斯科','Europe/Moscow'),cityClock('柏林','Europe/Berlin'),cityClock('巴黎','Europe/Paris'),cityClock('伦敦','Europe/London'),cityClock('旧金山','America/Los_Angeles'),cityClock('渥太华','America/Toronto'),cityClock('多伦多','America/Toronto'),cityClock('温哥华','America/Vancouver')];
const SOUTH_CITIES=[cityClock('悉尼','Australia/Sydney'),cityClock('堪培拉','Australia/Sydney'),cityClock('开普敦','Africa/Johannesburg'),cityClock('布宜诺斯艾利斯','America/Argentina/Buenos_Aires'),cityClock('圣保罗','America/Sao_Paulo'),cityClock('惠灵顿','Pacific/Auckland'),cityClock('乌斯怀亚','America/Argentina/Ushuaia')];
let mobileCityLayout={key:'',mode:'map',labels:[]};
function clockAngle(hour){return -((hour-12)/24)*2*Math.PI;}
function zoneOffset(zone,ts){const parts=Object.fromEntries(zone.formatter.formatToParts(new Date(ts)).map(p=>[p.type,p.value]));return Math.round((Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second)-Math.floor(ts/1000)*1000)/60000);}
let zoneMinute = null;
function refreshZones(ts){const minute=Math.floor(ts/60000);if(minute===zoneMinute)return;zoneMinute=minute;[...TIMEZONES,...NORTH_CITIES,...SOUTH_CITIES].forEach(z=>{z.min=zoneOffset(z,ts);const n=Math.abs(z.min);z.label='UTC'+(z.min>=0?'+':'-')+Math.floor(n/60)+(n%60?':'+String(n%60).padStart(2,'0'):'')+' '+z.city;});}
refreshZones(Date.now());
let tzIdx = 0, tz = TIMEZONES[0];

// ========== 图片加载（浏览器自动缓存，无需 Cache API）==========
function loadImage(img, url) {
  return window.TimeviewPreload.image(img,url,url.endsWith('.webp')?url.replace('.webp','.png'):null);
}

// Simplified Chang'e-1 icon and orbit, animated for teaching rather than telemetry.
const changEIcon = new Image();
loadImage(changEIcon, 'textures/change-orbiter.svg?v=3.57');
let changEPhase = 0;
function drawChangE(mx, my, mr, front) {
  const orbit = mr + 8, depth = Math.sin(changEPhase);
  // Project a tilted orbital plane. Draw its far half beneath the opaque Moon.
  // Almost orthographic projection and a steady attitude avoid turning sharply at the ends.
  const tilt = -Math.PI / 9;
  const ox = Math.cos(changEPhase) * orbit;
  const oy = depth * orbit * 0.42;
  const x = mx + ox * Math.cos(tilt) - oy * Math.sin(tilt);
  const y = my + ox * Math.sin(tilt) + oy * Math.cos(tilt);
  const size = Math.max(16, Math.min(24, mr * 0.82)) * (1 + depth * 0.03);
  if (front === (depth >= 0)) {
    ctx.save(); ctx.globalAlpha = 1;
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 10 + depth * 0.06);
    if (changEIcon.complete && changEIcon.naturalWidth) ctx.drawImage(changEIcon, -size/2, -size/3, size, size*2/3);
    else {ctx.scale(size/24,size/24);ctx.fillStyle='#ccc7b5';ctx.fillRect(-12,-4,24,8);ctx.fillRect(-4,-6,8,12);}
    ctx.restore();
  }
}

// ========== Canvas 2D（地球表盘） ==========
var renderer = null;
const cv = dom.getElementById('cv');
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, stars2d = [], earthZoom = 1;
let earthAnchor=null,earthMapRotation=0;
function resize() {
  if(W===innerWidth&&H===innerHeight&&DPR===Math.min(devicePixelRatio||1,2))return;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  stars2d = [];
  for (let i = 0; i < Math.round(W * H / 4500); i++) stars2d.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.2, a: 0.2 + Math.random() * 0.6 });
  if (renderer) { renderer.setSize(W, H, false); }
}
dom.onWindow('resize', resize);
resize();

// ========== 渲染主循环 ==========
let lastT = 0;
function ensureRenderer() {
  if (!renderer) {
    const glCanvas = dom.getElementById('gl');
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false });
    renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
  }
}

function frame(now) {
  if (!active) return;
  animationFrame = requestAnimationFrame(frame);
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  // 开场视频完全覆盖页面时，暂停背景 Canvas / WebGL 绘制，给视频解码留出资源。

  // 时间推进
  if (!tlDrag) {
    if (state.playing) state.t += state.spd * dt;
    if (inertia) { state.t += inertia * dt; inertia *= Math.exp(-1.4 * dt); if (Math.abs(inertia) < 1000) inertia = 0; }
  }
  if (window.introActive && !window.introTransitioning) return;
  if (state.playing) changEPhase = (changEPhase + dt * Math.PI * 2 / 10) % (Math.PI * 2);
  dispT += (state.t - dispT) * (1 - Math.exp(-8 * dt));
  refreshZones(dispT); dom.getElementById('tzBtn').textContent='🕓 '+tz.label;
  const d = dnum(dispT), date = new Date(dispT + tz.min * 60000);

  // ===== 星空旅行模式 =====
  if (state.view === 'voyage') {
    updateVoyage(dt, now);
    return;
  }

  // ===== 地球 2D =====
  if (state.view === 'earth') {
    drawEarth(d, date);
    dom.getElementById('einfo').style.display = '';
    dom.getElementById('voyHud').style.display = 'none';
  }

  // 日期读数
  if (now - (frame._hudT || 0) > 200) {
    frame._hudT = now;
    updateHUD(d, date);
  }
}

// ========== 地球 2D 绘制 ==========
const TEXBASE = 'textures/';
const EARTH_SKINS = ['satellite','admin','cartoon'];
const SKIN_NAMES = { satellite:'卫星', admin:'行政', cartoon:'卡通', golden:'金色丝线', tellurian:'地球仪' };
let curSkin = 'satellite';
function updateEarthLoading() {
  const el = dom.getElementById('earthLoading');
  if (el) el.style.display = isEarthReady() ? 'none' : 'block';
}
const earthImgCache = {}; // key: 'skin_hemi' → Image
function earthCacheKey(skin, hemi) { return skin + '_' + (hemi > 0 ? 'n' : 's'); }
function getEarthTexName(skin, hemi) {
  const pole = hemi > 0 ? 'earth-north-pole' : 'earth-south-pole';
  return skin === 'satellite' ? pole + '.webp' : pole + '-' + skin + '.png';
}
function getEarthImg() {
  const key = earthCacheKey(curSkin, state.hemi);
  return earthImgCache[key] || null;
}
function isEarthReady() {
  const img = getEarthImg();
  return img && img.complete && img.naturalWidth > 0;
}
function loadEarthPole() {
  const key = earthCacheKey(curSkin, state.hemi);
  if (earthImgCache[key]) return earthImgCache[key]._ready;
  const img = new Image();
  earthImgCache[key] = img;
  img.onload = () => updateEarthLoading();
  img._ready = loadImage(img, TEXBASE + getEarthTexName(curSkin, state.hemi));
  img._ready.catch(() => {delete earthImgCache[key];updateEarthLoading();});
  updateEarthLoading();
  return img._ready;
}
loadEarthPole();

const moonImg = new Image(); let moonReady = false;
moonImg.onload = () => { moonReady = true; };
loadImage(moonImg, TEXBASE + 'moon.jpg');

function makeEarthTex() {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  x.fillStyle = '#1b4a7a'; x.beginPath(); x.arc(s / 2, s / 2, s / 2, 0, 7); x.fill();
  return c;
}
let earthTex = null;

function drawMoonLit(mx, my, r, illum, rot) {
  const tex = moonReady ? moonImg : null;
  ctx.save(); ctx.translate(mx, my);
  ctx.beginPath(); ctx.arc(0, 0, r + 1, 0, 7); ctx.fillStyle = '#0a0e18'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.clip();
  if (tex) {
    ctx.drawImage(tex, -r, -r, 2 * r, 2 * r);
  } else {
    const g = ctx.createRadialGradient(-r * 0.15, -r * 0.1, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#cdd2dc'); g.addColorStop(0.5, '#b0b6c2'); g.addColorStop(0.85, '#8a90a0'); g.addColorStop(1, '#626878');
    ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.globalAlpha = 0.28;
    [[0.1, -0.05, 0.22], [-0.15, 0.1, 0.18], [0.18, 0.2, 0.15], [-0.05, -0.2, 0.2]].forEach(m => {
      const mg = ctx.createRadialGradient(m[0] * r, m[1] * r, 0, m[0] * r, m[1] * r, m[2] * r);
      mg.addColorStop(0, '#5a6070'); mg.addColorStop(1, 'rgba(90,96,112,0)');
      ctx.fillStyle = mg; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    });
    ctx.globalAlpha = 1;
  }
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i <= 30; i++) { const v = -1 + 2 * i / 30, sq = Math.sqrt(Math.max(0, 1 - v * v)), x = -r * sq, y = v * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  for (let i = 30; i >= 0; i--) { const v = -1 + 2 * i / 30, sq = Math.sqrt(Math.max(0, 1 - v * v)); ctx.lineTo((1 - 2 * illum) * r * sq, v * r); }
  ctx.closePath(); ctx.fillStyle = '#0a0e18'; ctx.fill();
  ctx.restore();
}

let introMapReleased=null;
try{
  const arrival=Number(sessionStorage.getItem('tv-intro-arrival'));
  sessionStorage.removeItem('tv-intro-arrival');
  if(arrival&&Date.now()-arrival<30000)introMapReleased=performance.now();
}catch(_){}
function earthClockRadius(r,mobile){return mobile?Math.max(r*EARTH_CFG.clockScale,Math.min(18,r*.32)):r*EARTH_CFG.clockScale;}
function earthGeometry(){
  const scrsv = document.body.classList.contains('scrsv');
  const scene=!scrsv&&window.TimeviewMobile?.sceneRect('earth');
  // Use a little more of the phone gutter while keeping clear of controls/panels.
  const mobile=scene?{...scene,left:Math.max(6,scene.left-6),right:Math.min(innerWidth-6,scene.right+6)}:null;
  let radius=Math.min(innerWidth,innerHeight)*EARTH_CFG.earthScale;
  if(mobile){
    const halfWidth=(mobile.right-mobile.left)/2,halfHeight=(mobile.bottom-mobile.top)/2;
    const labelPad=EARTH_CFG.hourNumSize*.75;
    // Fit the whole dial, including its labels and the sun, into the scene.
    radius=Math.max(1,Math.min((Math.min(halfWidth,halfHeight)-labelPad)/EARTH_CFG.hourRingScale,
      (halfHeight-12)/Math.abs(EARTH_CFG.sunY)));
  }
  return {x:scrsv?innerWidth*.68:mobile?(mobile.left+mobile.right)/2:innerWidth/2,
    y:mobile?(mobile.top+mobile.bottom)/2:innerHeight*EARTH_CFG.centerY,
    r:radius*earthZoom,mobile};
}
function drawEarth(d, date) {
  const {x:cx,y:cy,r:R,mobile}=earthGeometry();
  earthAnchor={x:cx,y:cy,r:R};
  const G = curSkin === 'golden';  // 金色丝线皮肤：文字白、线条金黄、背景黑
  const utcDate = new Date(dispT);  // 不加时区偏移，纯 UTC
  const utch = utcDate.getUTCHours() + utcDate.getUTCMinutes() / 60;
  const actualMerid = (90 - utch * 15) * RAD;
  let merid=actualMerid;
  if(window.introArrivalLock){introMapReleased=performance.now();merid=Math.PI;}
  else if(introMapReleased!==null){
    const p=Math.min(1,(performance.now()-introMapReleased)/1800),ease=p*p*(3-2*p);
    merid=Math.PI+Math.atan2(Math.sin(actualMerid-Math.PI),Math.cos(actualMerid-Math.PI))*ease;
    if(p===1)introMapReleased=null;
  }
  const _ld = new Date(dispT + tz.min * 60000);
  const _ln = solarToLunar(_ld.getUTCFullYear(), _ld.getUTCMonth()+1, _ld.getUTCDate());
  const ph = moonPhase(d, _ln ? _ln.day : null);
  if (!earthTex) earthTex = makeEarthTex();

  // 背景（金色丝线皮肤用纯黑，配合金色蒙版让外太空保持黑色）
  if (curSkin === 'golden') {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  } else {
    let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.8);
    g.addColorStop(0, '#0c1a38'); g.addColorStop(0.6, '#081024'); g.addColorStop(1, '#050a18');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  for (const s of stars2d) { ctx.globalAlpha = s.a; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;

  // 太阳
  const sx = cx, sy = cy + R * EARTH_CFG.sunY;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * EARTH_CFG.sunGlowScale);
  g.addColorStop(0, 'rgba(255,246,220,.95)'); g.addColorStop(0.4, 'rgba(248,200,110,.4)'); g.addColorStop(1, 'rgba(245,170,70,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R * EARTH_CFG.sunGlowScale, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, mobile?Math.max(4,Math.min(8,R*.075)):9, 0, 7); ctx.fill();

  // 地球
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip(); ctx.translate(cx, cy);
  const south = state.hemi < 0;
  const eimg = getEarthImg();
  // 地图底图统一逆时针校正15°；标记和刻度使用各自的绘制坐标。
  const mapRotation = (south ? merid + 150 * RAD : merid) - 15 * RAD;
  earthMapRotation=mapRotation;
  ctx.rotate(mapRotation);
  const RR = R * 1.08;
  if (isEarthReady()) { ctx.drawImage(eimg, -RR, -RR, 2 * RR, 2 * RR); }
  else { ctx.drawImage(earthTex, -RR, -RR, 2 * RR, 2 * RR); }
  ctx.restore();

  // 地球光晕
  let ag = ctx.createRadialGradient(cx, cy, R * EARTH_CFG.earthGlowInner, cx, cy, R * EARTH_CFG.earthGlowOuter);
  ag.addColorStop(0, 'rgba(90,200,255,0)'); ag.addColorStop(0.5, G ? 'rgba(230,194,0,.20)' : 'rgba(90,200,255,.18)'); ag.addColorStop(1, 'rgba(90,200,255,0)');
  ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, cy, R * EARTH_CFG.earthGlowOuter, 0, 7); ctx.fill();

  // 地球边框
  ctx.strokeStyle = G ? 'rgba(230,194,0,.55)' : 'rgba(95,214,240,.3)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, cy, R * EARTH_CFG.earthBorderScale, 0, 7); ctx.stroke();

  // 时间刻度环：0 点正下方；12 点由太阳表示。
  const hRing=R*EARTH_CFG.hourRingScale;
  const hourFont=mobile?Math.max(10,Math.min(13,R*.14)):EARTH_CFG.hourNumSize;
  const tickLength=mobile?Math.max(3,Math.min(7,R*.055)):0;
  const dotSize=mobile?Math.max(.9,Math.min(1.25,R*.014)):1.4;
  // Keep the dots clear of the glyphs even on narrow screens or when zoomed out.
  const hDot=Math.max(0,hRing-Math.max(hourFont+(mobile?3:2),R*(EARTH_CFG.hourRingScale-EARTH_CFG.hourDotScale)));
  ctx.save(); ctx.translate(cx, cy); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let h = 0; h < 24; h++) {
    if(h===12)continue;
    const a = clockAngle(h), nx = Math.sin(a), ny = -Math.cos(a);
    // 小圆点
    ctx.fillStyle = G ? 'rgba(230,194,0,.8)' : 'rgba(150,200,230,.72)'; ctx.beginPath(); ctx.arc(nx * hDot, ny * hDot, dotSize, 0, 7); ctx.fill();
    // 双数=数字（不旋转，水平），单数=竖线（旋转朝向圆心）
    if (h % (mobile&&R<54?4:2) === 0) {
      ctx.fillStyle = G ? '#fff' : 'rgba(165,212,238,.92)'; ctx.font = hourFont + 'px sans-serif';
      ctx.fillText(String(h).padStart(2, '0'), nx * hRing, ny * hRing);
    } else {
      ctx.save(); ctx.translate(nx * hRing, ny * hRing); ctx.rotate(a);
      if(mobile){
        ctx.strokeStyle=G?'rgba(230,194,0,.8)':'rgba(135,185,214,.78)';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(0,-tickLength/2);ctx.lineTo(0,tickLength/2);ctx.stroke();
      }else{
        ctx.fillStyle=G?'rgba(230,194,0,.8)':'rgba(135,185,214,.78)';ctx.font='bold '+(hourFont+1)+'px sans-serif';
        ctx.fillText('|',0,0);
      }
      ctx.restore();
    }
  }
  // 时区指针（和小程序一致）
  const ptr = (hh, col) => { const a = clockAngle(hh); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(Math.sin(a) * R * EARTH_CFG.ptrTipScale, -Math.cos(a) * R * EARTH_CFG.ptrTipScale); ctx.lineTo(Math.sin(a - 0.035) * R, -Math.cos(a - 0.035) * R); ctx.lineTo(Math.sin(a + 0.035) * R, -Math.cos(a + 0.035) * R); ctx.closePath(); ctx.fill(); };
  ptr(utch, G ? '#e6c200' : '#5fd6f0'); ptr(utch + tz.min / 60, '#ffd24a');
  ctx.restore();

  // 城市标注
  if (showCities) {
  const list = state.hemi < 0 ? SOUTH_CITIES : NORTH_CITIES;
  const cityPoints=[];
  const markerScale=mobile?Math.max(.65,Math.min(1,R/100)):1;
  const sameZoneCount = new Map();
  for (const c of list) {
    const rank = sameZoneCount.get(c.min) || 0;
    sameZoneCount.set(c.min, rank + 1);
    const dotR = R * (0.90 - rank * 0.16);
    const az = clockAngle(utch + c.min / 60);
    const sinA = Math.sin(az), cosA = Math.cos(az);
    const px = cx + sinA * dotR, py = cy - cosA * dotR;
    if(mobile)cityPoints.push({name:c.cn,star:c.star,px,py});
    ctx.globalAlpha = 1;
    // 圆点
    if (c.star) {
      // 北京红星
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * 4 * Math.PI / 5;
        const r = (i % 2 === 0 ? 6 : 2.8)*markerScale;
        i === 0 ? ctx.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r) : ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(px, py, 2.8*markerScale, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,74,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, 5*markerScale, 0, 7); ctx.stroke();
    }
    if(mobile)continue;
    // 桌面保留原有字号与径向标注。
    ctx.font = (c.star ? 'bold ' : '') + '13px sans-serif';
    const tw = ctx.measureText(c.cn).width;
    let labelR = dotR - 14;
    const maxR = R * 0.93 - tw / 2;
    if (labelR > maxR) labelR = maxR;
    if (labelR < R * 0.26) labelR = R * 0.26;
    const lx = cx + sinA * labelR, ly = cy - cosA * labelR;
    // 引线
    if (Math.hypot(lx - px, ly - py) > 6) {
      ctx.strokeStyle = 'rgba(255,210,74,.45)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(lx, ly); ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(6,14,30,.72)'; ctx.fillRect(lx - tw / 2 - 3, ly - 6, tw + 6, 12);
    ctx.fillStyle = G ? '#fff' : (c.star ? '#ffd7d3' : '#fff7e0');
    ctx.fillText(c.cn, lx, ly);
    ctx.globalAlpha = 1;
  }
  if(mobile){
    const key=[cx,cy,R,state.hemi,utch,...Object.values(mobile),...list.map(c=>c.min)].join('|');
    if(mobileCityLayout.key!==key){
      mobileCityLayout={key,...TimeviewCityLabels.layout({cities:cityPoints,cx,cy,r:R,clockRadius:earthClockRadius(R,mobile),bounds:mobile,measure(name,font,star){
        ctx.font=(star?'bold ':'')+font+'px sans-serif';return ctx.measureText(name).width;
      }})};
    }
    ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=.65;
    for(const label of mobileCityLayout.labels){
      const endX=Math.max(label.box.left,Math.min(label.box.right,label.px));
      const endY=Math.max(label.box.top,Math.min(label.box.bottom,label.py));
      ctx.strokeStyle=G?'rgba(230,194,0,.4)':'rgba(230,206,150,.48)';
      ctx.beginPath();ctx.moveTo(label.px,label.py);ctx.lineTo(endX,endY);ctx.stroke();
    }
    for(const label of mobileCityLayout.labels){
      ctx.font=(label.star?'bold ':'')+label.font+'px sans-serif';
      ctx.fillStyle='rgba(6,14,30,.78)';ctx.fillRect(label.box.left,label.box.top,label.width,label.height);
      ctx.fillStyle=G?'#fff':label.star?'#ffd7d3':'#fff7e0';ctx.fillText(label.name,label.x,label.y);
    }
    ctx.restore();
  }
  }

  // 中央时钟表盘
  const rc = earthClockRadius(R,mobile);
  ctx.save(); ctx.translate(cx, cy);
  ctx.beginPath(); ctx.arc(0, 0, rc, 0, 7); ctx.fillStyle = G ? '#000' : '#f7faff'; ctx.fill();
  ctx.strokeStyle = G ? 'rgba(230,194,0,.6)' : 'rgba(60,90,120,.6)'; ctx.lineWidth = 1.2; ctx.stroke();
  for (let i = 0; i < 12; i++) { const a = i / 12 * 2 * Math.PI; ctx.strokeStyle = G ? 'rgba(230,194,0,.5)' : 'rgba(40,60,90,.5)'; ctx.lineWidth = i % 3 === 0 ? 1.5 : 0.7; ctx.beginPath(); ctx.moveTo(Math.sin(a) * rc * 0.82, -Math.cos(a) * rc * 0.82); ctx.lineTo(Math.sin(a) * rc * 0.95, -Math.cos(a) * rc * 0.95); ctx.stroke(); }
  // 分钟刻度 0/10/20/30/40/50
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + (mobile?Math.max(5,Math.min(7,Math.round(rc*.32))):Math.max(6,Math.round(rc*.18))) + 'px sans-serif';
  ctx.fillStyle = G ? '#fff' : 'rgba(28,43,68,.95)';
  if(!mobile||rc>=12)for (let m = 0; m < 60; m += mobile&&rc<16?15:10) { const ma = (m / 60) * 2 * Math.PI; ctx.fillText(String(m), Math.sin(ma) * rc * 0.66, -Math.cos(ma) * rc * 0.66); }
  ctx.fillStyle = G ? '#fff' : 'rgba(28,43,68,.9)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + Math.max(7, Math.round(rc * 0.24)) + 'px sans-serif';
  // The mobile toolbar already shows the date; leave the small clock for minutes.
  if(!mobile)ctx.fillText(p2(date.getUTCMonth() + 1) + '.' + p2(date.getUTCDate()), 0, rc * 0.45);
  const minu = date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const sec = date.getUTCSeconds() + date.getUTCMilliseconds() / 1000;
  let a = minu / 60 * 2 * Math.PI; ctx.strokeStyle = G ? '#e6c200' : '#1c2b44'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(a) * rc * 0.6, -Math.cos(a) * rc * 0.6); ctx.stroke();
  a = sec / 60 * 2 * Math.PI; ctx.strokeStyle = G ? '#e6c200' : '#e0453a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-Math.sin(a) * rc * 0.12, Math.cos(a) * rc * 0.12); ctx.lineTo(Math.sin(a) * rc * 0.78, -Math.cos(a) * rc * 0.78); ctx.stroke();
  ctx.fillStyle = G ? '#e6c200' : '#1c2b44'; ctx.beginPath(); ctx.arc(0, 0, rc * 0.07, 0, 7); ctx.fill();
  ctx.restore();

  // 月球
  const Or = R * EARTH_CFG.moonOrbitScale, ma = ph.el * RAD, mx = cx - Math.sin(ma) * Or, my = cy - Math.cos(ma) * Or, mr = Math.min(EARTH_CFG.moonSize, R * 0.15);
  const cAng = Math.atan2(cy - my, cx - mx), sAng = Math.atan2(sy - my, sx - mx);
  const adist = (a, b) => { let dd = Math.abs((a - b) % (2 * Math.PI)); return dd > Math.PI ? 2 * Math.PI - dd : dd; };
  const t1 = cAng - Math.PI / 2, t2 = cAng + Math.PI / 2;
  const mrot = adist(t1, sAng) <= adist(t2, sAng) ? t1 : t2;
  drawChangE(mx, my, mr, false);
  drawMoonLit(mx, my, mr, ph.illum, mrot);
  drawChangE(mx, my, mr, true);
  window._moonXY = { x: mx, y: my, r: mr };
}

// ========== HUD 更新 ==========
function updateHUD(d, date) {
  const dateStr = date.getUTCFullYear() + '-' + p2(date.getUTCMonth() + 1) + '-' + p2(date.getUTCDate()) + ' ' + p2(date.getUTCHours()) + ':' + p2(date.getUTCMinutes()) + ':' + p2(date.getUTCSeconds()) + ' ' + tz.label;
  var _dNow = new Date(dispT + tz.min * 60000);
  var _lunar = solarToLunar(_dNow.getUTCFullYear(), _dNow.getUTCMonth()+1, _dNow.getUTCDate());
  var _term = solarTerm(dnum(dispT));
  dom.getElementById('dateText').textContent = dateStr + (_lunar ? ' · ' + (_lunar.isLeap?'闰':'') + _lunar.monthName + _lunar.dayName : '') + ' · ' + _term.name;
  const ph = moonPhase(d, _lunar ? _lunar.day : null), st = solarTerm(d);
  dom.getElementById('eiTerm').textContent = '节气 ' + st.name + ' · 距下一节气 ' + st.toNext + '天 ' + st.next;
}

// ========== 时间控制 ==========
dom.getElementById('pPlay').onclick = () => { state.playing = !state.playing; try { sessionStorage.setItem('tv-clock-paused', state.playing ? '0' : '1'); } catch (_) {} dom.getElementById('pPlay').textContent = state.playing ? '❚❚' : '▶'; };
dom.getElementById('pNow').onclick = () => { state.t = Date.now(); dispT = state.t; anchorT = state.t; curUnit = 'sec'; state.spd = SPD.sec; state.playing=true;try{sessionStorage.setItem('tv-clock-paused','0');}catch(_){} dom.getElementById('pPlay').textContent = '❚❚'; };
dom.getElementById('pPrev').onclick = () => { state.t -= 30 * 86400e3; };
dom.getElementById('pNext').onclick = () => { state.t += 30 * 86400e3; };
dom.getElementById('pSlow').onclick = () => { const u = ['sec','hour','day','month','year']; const i = u.indexOf(curUnit); if (i > 0) { curUnit = u[i - 1]; state.spd = SPD[curUnit]; dom.getElementById('pPlay').textContent = state.playing ? '❚❚' : '▶'; } };
dom.getElementById('pFast').onclick = () => { const u = ['sec','hour','day','month','year']; const i = u.indexOf(curUnit); if (i < u.length - 1) { curUnit = u[i + 1]; state.spd = SPD[curUnit]; dom.getElementById('pPlay').textContent = state.playing ? '❚❚' : '▶'; } };

// ===== 农历计算库 =====
var lunarInfo=[0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b5a0,0x195a6,0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,0x0d520];
function lunarLeap(y){return lunarInfo[y-1900]&0xf;}
function lunarLeapDays(y){return lunarLeap(y)?((lunarInfo[y-1900]&0x10000)?30:29):0;}
function lunarMonthDays(y,m){return(lunarInfo[y-1900]&(0x10000>>m))?30:29;}
function lunarYearDays(y){var s=348;for(var i=0x8000;i>0x8;i>>=1)s+=(lunarInfo[y-1900]&i)?1:0;return s+lunarLeapDays(y);}
function lunarMonths(y){var ms=[],leap=lunarLeap(y);for(var m=1;m<=12;m++){ms.push({m:m,isLeap:false,label:['\u6b63','\u4e8c','\u4e09','\u56db','\u4e94','\u516d','\u4e03','\u516b','\u4e5d','\u5341','\u51ac','\u814a'][m-1]+'\u6708'});if(m===leap)ms.push({m:m,isLeap:true,label:'\u95f0'+['\u6b63','\u4e8c','\u4e09','\u56db','\u4e94','\u516d','\u4e03','\u516b','\u4e5d','\u5341','\u51ac','\u814a'][m-1]+'\u6708'});}return ms;}
// ===== 天文农历（覆盖 ±5000 年，用现代置闰规则推算；精度略低于 1900-2100 查表）=====
function _astroNewMoonTime(d){let t=d;for(let i=0;i<15;i++){const el=rev(moonLon(t)-sunLon(t));const err=el>180?el-360:el;t-=(err/360)*SYN;if(Math.abs(err)<1e-7)break;}return t;}
function _astroShuoDay(d){let t=_astroNewMoonTime(d);let sd=Math.round(t+8/24);if(sd>d){t-=SYN;sd=Math.round(t+8/24);}return sd;}
function _astroNextShuoDay(d){let t=_astroNewMoonTime(d);let sd=Math.round(t+8/24);if(sd<=d){t+=SYN;sd=Math.round(t+8/24);}return sd;}
function _astroSunLonDay(d,target){let t=d;for(let i=0;i<15;i++){const s=sunLon(t);let err=rev(s-target);if(err>180)err-=360;t-=err/0.9856;if(Math.abs(err)<1e-7)break;}return Math.round(t+8/24);}
function solarToLunarAstro(y,m,d){
  const day=Math.round(dnum(Date.UTC(y,m-1,d,12,0,0)));
  const shuo=_astroShuoDay(day), nextShuo=_astroNextShuoDay(shuo);
  let lunarDay=day-shuo+1;
  let hasZQ=false;
  for(let k=0;k<12;k++){const t=(k*30)%360;const zq=_astroSunLonDay(shuo+14,t);if(zq>=shuo&&zq<nextShuo){hasZQ=true;break;}}
  let dongZhi=_astroSunLonDay(day,270); if(dongZhi>day) dongZhi=_astroSunLonDay(day-365,270);
  const dongZhiShuo=_astroShuoDay(dongZhi);
  const offset=Math.round((shuo-dongZhiShuo)/SYN);
  const regMonth=off=>((11+off-1)%12+12)%12+1;
  let month=regMonth(offset), isLeap=false;
  if(!hasZQ&&month!==11){isLeap=true;month=regMonth(offset-1);}
  const dongZhiYear=new Date(J2000+dongZhi*86400e3).getUTCFullYear();
  const year=dongZhiYear+(offset>=2?1:0);
  if(lunarDay<1)lunarDay=1; if(lunarDay>30)lunarDay=30;
  const mStr=['正','二','三','四','五','六','七','八','九','十','冬','腊'];
  const dStr=['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
  return {year:year,month:month,day:lunarDay,isLeap:isLeap,monthName:mStr[month-1]+'月',dayName:dStr[lunarDay-1]||''};
}
function solarToLunar(y,m,d){
  if (y < 1900 || y > 2100) return solarToLunarAstro(y, m, d);  // 超出查表范围，用天文推算
  var off=Math.round((Date.UTC(y,m-1,d)-Date.UTC(1900,0,31))/86400000);
  var year=1900,leap=0;
  for(var i=1900;i<2101&&off>0;i++){var dy=lunarYearDays(i);off-=dy;}
  if(off<0){off+=lunarYearDays(--i);}
  year=i;leap=lunarLeap(year);
  var isLeap=false,month=1;
  for(var j=1;j<13&&off>0;j++){
    var dm=lunarMonthDays(year,j);
    if(j===leap){dm=lunarLeapDays(year);}
    off-=dm;month=j;
  }
  if(off<0){off+=dm;}
  var mStr=['\u6b63','\u4e8c','\u4e09','\u56db','\u4e94','\u516d','\u4e03','\u516b','\u4e5d','\u5341','\u51ac','\u814a'];
  var dStr=['\u521d\u4e00','\u521d\u4e8c','\u521d\u4e09','\u521d\u56db','\u521d\u4e94','\u521d\u516d','\u521d\u4e03','\u521d\u516b','\u521d\u4e5d','\u521d\u5341','\u5341\u4e00','\u5341\u4e8c','\u5341\u4e09','\u5341\u56db','\u5341\u4e94','\u5341\u516d','\u5341\u4e03','\u5341\u516b','\u5341\u4e5d','\u4e8c\u5341','\u5eff\u4e00','\u5eff\u4e8c','\u5eff\u4e09','\u5eff\u56db','\u5eff\u4e94','\u5eff\u516d','\u5eff\u4e03','\u5eff\u516b','\u5eff\u4e5d','\u4e09\u5341'];
  return {year:year,month:month,day:off+1,isLeap:isLeap,monthName:mStr[month-1]+'\u6708',dayName:dStr[off]};
}

const today = new Date(); const p2 = n => String(n).padStart(2, '0');

// 时区选择（弹窗）
dom.getElementById('tzPopup').onclick = function(e) { if (e.target === this) this.style.display = 'none'; };

// 速度选择（弹窗）
dom.getElementById('spdBtn').onclick = () => {
  const popup = dom.getElementById('spdPopup');
  popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
};
dom.querySelectorAll('.spd-opt[data-u]').forEach(el => {
  el.onclick = () => {
    const u = el.dataset.u;
    curUnit = u; state.spd = SPD[u];
    dom.getElementById('pPlay').textContent = state.playing ? '❚❚' : '▶';
    const labels = { sec: '秒/秒', hour: '时/秒', day: '日/秒', month: '月/秒', year: '年/秒' };
    dom.getElementById('spdBtn').textContent = '⚡ ' + labels[u] + ' ▾';
    dom.querySelectorAll('.spd-opt[data-u]').forEach(o => o.classList.toggle('on', o.dataset.u === u));
    dom.getElementById('spdPopup').style.display = 'none';
  };
});
// 点击空白关闭弹窗
dom.onDocument('click', (e) => {
  if (!e.target.closest('#spdPopup') && !e.target.closest('#spdBtn')) {
    dom.getElementById('spdPopup').style.display = 'none';
  }
  if (!e.target.closest('#skinPopup') && !e.target.closest('#btnSkin')) {
    dom.getElementById('skinPopup').style.display = 'none';
  }
  if (!e.target.closest('#datePicker') && !e.target.closest('#dateText') && !e.target.closest('#tzBtn')) {
    dom.getElementById('datePicker').style.display = 'none';
  }
});

// 日期点击 → 打开跳转面板
// ===== 日期选择器 =====
var dpYear = today.getFullYear(), dpMonth = today.getMonth(), dpSelected = today.getDate();
const syncLunarPicker=TimeviewCalendar.lunarPicker(()=>({y:dpYear,m:dpMonth+1,d:dpSelected}),(y,m,d)=>{dpYear=y;dpMonth=m-1;dpSelected=d;renderCalendar()},dom);
function setPickerDraft(ts){
  const d=new Date(ts+zoneOffset(tz,ts)*60000);
  dpYear=d.getUTCFullYear();dpMonth=d.getUTCMonth();dpSelected=d.getUTCDate();
  dom.getElementById('dpTime').value=[d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds()].map(p2).join(':');
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

function renderCalendar() {
  dpSelected=Math.min(Math.max(1,dpSelected),new Date(dpYear,dpMonth+1,0).getDate());
  dom.getElementById('dpTitle').textContent = (dpMonth + 1) + '月';
  var ySel = dom.getElementById('dpYear');
  if (ySel) {
    ySel.min = new Date().getFullYear() - 5000;
    ySel.max = new Date().getFullYear() + 5000;
    if (!ySel.dataset.bound) { ySel.dataset.bound = '1'; ySel.onchange = function(){ dpYear = parseInt(this.value) || dpYear; renderCalendar(); }; }
    ySel.value = dpYear;
  }
  var grid = dom.getElementById('dpGrid');
  grid.innerHTML = '';
  ['日','一','二','三','四','五','六'].forEach(function(d) {
    var el = document.createElement('div'); el.className = 'dp-cell head'; el.textContent = d; grid.appendChild(el);
  });
  var firstDay = new Date(dpYear, dpMonth, 1).getDay();
  var daysInMonth = new Date(dpYear, dpMonth + 1, 0).getDate();
  var daysInPrev = new Date(dpYear, dpMonth, 0).getDate();
  var now = new Date();
  for (var i = 0; i < firstDay; i++) {
    var el = document.createElement('div'); el.className = 'dp-cell other';
    el.textContent = daysInPrev - firstDay + 1 + i; grid.appendChild(el);
  }
  for (var d = 1; d <= daysInMonth; d++) {
    var el = document.createElement('button'); el.type='button';el.className = 'dp-cell';
    if (d === now.getDate() && dpMonth === now.getMonth() && dpYear === now.getFullYear()) el.classList.add('today');
    if (d === dpSelected) el.classList.add('selected');
    TimeviewCalendar.decorateCell(el,dpYear,dpMonth+1,d);
    el.onclick = (function(dd) { return function(event) { event.stopPropagation();dpSelected = dd; renderCalendar(); }; })(d);
    grid.appendChild(el);
  }
  var remaining = 42 - firstDay - daysInMonth;
  for (var i = 1; i <= remaining; i++) {
    var el = document.createElement('div'); el.className = 'dp-cell other'; el.textContent = i; grid.appendChild(el);
  }
  TimeviewCalendar.selection(dpYear,dpMonth+1,dpSelected,dom);
  // Update lunar info
  var lunar = solarToLunar(dpYear, dpMonth + 1, dpSelected);
  var _st = solarTerm(dnum(Date.UTC(dpYear, dpMonth, dpSelected) + 12*3600000));
  var yearLabel = dpYear >= 0 ? dpYear + '年' : '公元前 ' + (-dpYear) + '年';
  if (lunar) {
    dom.getElementById('lunarInfo').textContent = lunar.year + '年' + (lunar.isLeap ? '闰' : '') + lunar.monthName + lunar.dayName + ' · ' + _st.name;
  } else {
    dom.getElementById('lunarInfo').textContent = yearLabel + ' · ' + _st.name;
  }
}

dom.getElementById('dateText').onclick = function() {
  var picker = dom.getElementById('datePicker');
  if (picker.style.display === 'none') {
    setPickerDraft(state.t);picker.style.display = 'block';
  } else { picker.style.display = 'none'; }
};
dom.getElementById('dpCancel').onclick = function() { dom.getElementById('datePicker').style.display = 'none'; };
dom.getElementById('dpToday').onclick = function() {
  setPickerDraft(Date.now());
};
// Only confirmation applies the draft; closing discards it on the next open.
function jumpToDate() {
  var ts = dom.getElementById('dpTime').value || '12:00';
  var hm = ts.split(':');
  var civil=new Date(0);civil.setUTCFullYear(dpYear,dpMonth,dpSelected);civil.setUTCHours(+hm[0]||0,+hm[1]||0,+hm[2]||0,0);var local=civil.getTime();
  var target=local-tz.min*60000;
  for(var i=0;i<3;i++) target=local-zoneOffset(tz,target)*60000;
  state.t=target; refreshZones(target);
  inertia=0;tlDrag=false;
  dispT = state.t; anchorT = state.t;
  dom.getElementById('pPlay').textContent = state.playing ? '❚❚' : '▶';
}
dom.getElementById('dpConfirm').onclick=function(){
  const input=dom.getElementById('dpTime');input.required=true;if(!input.reportValidity())return;
  window.dispatchEvent(new Event('timeview:manual-view'));jumpToDate();dom.getElementById('datePicker').style.display='none';
};
dom.onDocument('pointerdown', function(e) {
  if (!e.target.closest('#datePicker') && !e.target.closest('#dateText')) {
    dom.getElementById('datePicker').style.display = 'none';
  }
});

// 时区切换
// 时区选择弹窗
dom.getElementById('tzBtn').onclick = function(e) {
  e.stopPropagation();
  var popup = dom.getElementById('tzPopup');
  var opts = dom.getElementById('tzOptions');
  if (popup.style.display !== 'none') { popup.style.display = 'none'; return; }

  // 定位到按钮上方
  var rect = this.getBoundingClientRect();
  popup.style.left = Math.max(8, rect.left) + 'px';
  popup.style.transform = 'none';
  popup.style.bottom = (window.innerHeight - rect.top + 6) + 'px';

  opts.innerHTML = '';
  TIMEZONES.forEach(function(t, i) {
    var el = document.createElement('div');
    el.className = 'tz-opt' + (tz === t ? ' on' : '');
    el.textContent = '🕓 ' + t.label;
    el.onclick = function() { tz = t; dom.getElementById('tzBtn').textContent = '🕓 ' + t.label; popup.style.display = 'none'; };
    opts.appendChild(el);
  });
  popup.style.display = 'block';
  // 防溢出：超出屏幕右边界时左移
  var _pw = popup.offsetWidth, _ml = window.innerWidth - _pw - 8;
  if (_pw && (parseFloat(popup.style.left) || 0) > _ml) popup.style.left = Math.max(8, _ml) + 'px';
};
dom.onDocument('click', function(e) {
  if (!e.target.closest('#tzPopup') && !e.target.closest('#tzBtn')) {
    dom.getElementById('tzPopup').style.display = 'none';
  }
});

// Lunar controls use the shared draft picker above.

// 时间轴
function setView(v) {
  if (v === 'voyage') { enterVoyage(); return; }
  ++voyageRequest;
  if (state.view === 'voyage') exitVoyage();
  state.view = v;
  dom.getElementById('gl').classList.toggle('show', v === 'voyage');
  dom.getElementById('cv').style.display = v === 'earth' ? '' : 'none';
}

// ========== 星空旅行 ==========
const COS_DEST = [
  { name: '火星', dist: 0.00001, host: '太阳系', kind: 'planet' },
  { name: '木星', dist: 0.00008, host: '太阳系', kind: 'planet' },
  { name: '土星', dist: 0.00016, host: '太阳系', kind: 'planet' },
  { name: '比邻星', dist: 4.246, host: '半人马座α', kind: 'star' },
  { name: '天狼星', dist: 8.6, host: '大犬座', kind: 'star' },
  { name: '织女星', dist: 25.3, host: '天琴座', kind: 'star' },
  { name: '北极星', dist: 433, host: '小熊座', kind: 'star' },
  { name: '猎户座星云', dist: 1344, host: '猎户座', kind: 'nebula' },
  { name: '昴宿星团', dist: 444, host: '金牛座', kind: 'cluster' },
  { name: '银河系中心', dist: 26000, host: '人马座', kind: 'galaxy' },
  { name: '仙女座星系', dist: 2537000, host: '仙女座', kind: 'galaxy' }
];
const AU_LY = 1 / 63241.1;

let voyage = null, _voyState = 'orbit', _destDist = 0, _distLy = 0, _speedC = 0, _maxC = 0, _missionY = 0;
let _destIdx = 3, _warpIdx = 0;
const WLV = [2.635e-5, 1e-4, 5e-4, 0.002, 0.01, 0.05, 0.2, 0.5, 1, 2, 3, 5, 10, 30, 100, 300, 1000, 10000, 100000, 1000000];

let voyageLibrary = null, voyageRequest = 0;
function loadVoyageLibrary() {
  if (window.THREE) return Promise.resolve();
  if (!voyageLibrary) voyageLibrary = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.bootcdn.net/ajax/libs/three.js/r128/three.min.js';
    script.onload = () => window.THREE ? resolve() : reject(new Error('Three.js unavailable'));
    script.onerror = () => { script.remove(); reject(new Error('Three.js download failed')); };
    document.head.append(script);
  }).catch(error => { voyageLibrary = null; throw error; });
  return voyageLibrary;
}
async function enterVoyage() {
  const request = ++voyageRequest;
  // The Earth view and its opening use no WebGL library. Download it only
  // when entering this view, leaving startup bandwidth for the movie.
  try {
    await loadVoyageLibrary();
    if (request !== voyageRequest) return;
    ensureRenderer();
    if (!voyage) initVoyageScene();
  } catch (error) {
    console.warn('Voyage unavailable:', error);
    if (request === voyageRequest) alert('星空旅行加载失败，请检查网络后重试。');
    return;
  }
  state.view = 'voyage';
  dom.getElementById('gl').classList.add('show');
  dom.getElementById('cv').style.display = 'none';
  dom.getElementById('voyHud').style.display = '';
  setupVoyRoute();
}
function exitVoyage() {
  ++voyageRequest;
  dom.getElementById('voyHud').style.display = 'none';
  dom.getElementById('gl').classList.remove('show');
  dom.getElementById('cv').style.display = '';
  state.view = 'earth';
}

function initVoyageScene() {
  // 复用已有 renderer/scene/cam 但创建旅行专用场景
  voyage = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(70, W / H, 0.1, 9000), waypoints: [] };
  voyage.scene.background = new THREE.Color(0x03050c);
  voyage.scene.add(new THREE.AmbientLight(0x96a4c0, 0.75));
  const key = new THREE.PointLight(0xdfe9ff, 1.4, 0, 0.12); key.position.set(30, 20, 40); voyage.scene.add(key);
  // 星空
  const p = [], c = [];
  for (let i = 0; i < 2400; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * 6.283, s = Math.sqrt(1 - u * u), R = 3400;
    p.push(s * Math.cos(th) * R, u * R, s * Math.sin(th) * R);
    const t = Math.random(); const b = 0.45 + Math.random() * 0.55;
    c.push((t < 0.25 ? 0.72 : t > 0.85 ? 1 : 1) * b, (t < 0.25 ? 0.8 : t > 0.85 ? 0.84 : 1) * b, (t < 0.25 ? 1 : t > 0.85 ? 0.64 : 1) * b);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  starGeo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  voyage.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 2, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending })));
  // 目的地选择器
  const destEl = dom.getElementById('voyDest');
  COS_DEST.forEach((d, i) => { const o = document.createElement('option'); o.value = i; o.textContent = d.name + ' · ' + (d.kind === 'planet' ? (d.dist / AU_LY < 1 ? (d.dist / AU_LY).toFixed(2) + ' AU' : d.dist + ' ly') : d.dist + ' ly'); destEl.appendChild(o); });
  destEl.value = _destIdx;
  destEl.onchange = () => { _destIdx = +destEl.value; setupVoyRoute(); };
}

function setupVoyRoute() {
  const dest = COS_DEST[_destIdx];
  _destDist = dest.dist;
  _voyState = 'orbit'; _distLy = 0; _speedC = 0; _maxC = 0; _missionY = 0; _warpIdx = 0;
  dom.getElementById('voyMis').textContent = '⌖ 前往 ' + dest.name;
  dom.getElementById('voyGo').textContent = '出发';
  dom.getElementById('voyPass').textContent = '地球轨道 · 待命';
  dom.getElementById('voySpeed').textContent = '0 km/s';
  dom.getElementById('voyDist').textContent = '0 AU';
  dom.getElementById('voyEta').textContent = '—';
}

function updateVoyage(dt, now) {
  if (_voyState === 'run') {
    const target = WLV[_warpIdx] || 0;
    _speedC += (target - _speedC) * Math.min(1, dt * 1.1);
    const dMY = dt * 10 / 365.25;
    _missionY += dMY;
    _distLy += _speedC * dMY;
    if (_speedC > _maxC) _maxC = _speedC;
    if (_distLy >= _destDist) { _distLy = _destDist; _voyState = 'arrived'; }
  }
  // 渲染
  renderer.render(voyage.scene, voyage.cam);
  // HUD
  if (now - (updateVoyage._hudT || 0) > 300) {
    updateVoyage._hudT = now;
    dom.getElementById('voySpeed').textContent = _speedC < 0.01 ? (_speedC * 299792).toFixed(0) + ' km/s' : _speedC.toFixed(2) + ' c';
    dom.getElementById('voyDist').textContent = _distLy < 0.02 ? (_distLy / AU_LY).toFixed(2) + ' AU' : _distLy.toFixed(2) + ' ly';
    dom.getElementById('voyEta').textContent = _voyState === 'arrived' ? '已抵达' : _speedC > 1e-9 ? fmtTime(_destDist - _distLy, _speedC) : '—';
    dom.getElementById('voyPass').textContent = _voyState === 'arrived' ? '已抵达 ' + COS_DEST[_destIdx].name : '— 星际空间 —';
    dom.getElementById('voyGo').textContent = _voyState === 'orbit' ? '出发' : _voyState === 'run' ? '暂停' : _voyState === 'pause' ? '继续' : '已抵达';
  }
}
function fmtTime(remLy, speedC) {
  const y = remLy / speedC;
  if (y < 1) return Math.round(y * 365) + ' 天';
  if (y < 100) return y.toFixed(1) + ' 年';
  return Math.round(y) + ' 年';
}

dom.getElementById('voyGo').onclick = () => {
  if (_voyState === 'orbit') { _voyState = 'run'; _speedC = WLV[0]; }
  else if (_voyState === 'run') _voyState = 'pause';
  else if (_voyState === 'pause') _voyState = 'run';
};
dom.getElementById('voySlow').onclick = () => { _warpIdx = Math.max(0, _warpIdx - 1); };
dom.getElementById('voyFast').onclick = () => { _warpIdx = Math.min(WLV.length - 1, _warpIdx + 1); };
dom.getElementById('voyExit').onclick = () => exitVoyage();

// ========== 触摸交互 ==========
let drag = null, pinch = null;
function isUI(t) {
  if (t?.closest?.('#tv-course-visual')) return true;
  return !!(t && t.closest && t.closest('button,a,input,select,textarea,[onclick],.topbar,.bottombar,.view-seg,#tv-fab,#tv-assist,#datePicker,#spdPopup,#skinPopup,#tzPopup,.fort-mask,.card-mask,.guide-card,.guide-overlay'));
}
function onTouchStart(e) {
  if (isUI(e.target)) return;  // 点按交互元素不拦截，让按钮正常触发 click
  e.preventDefault && e.preventDefault();
  if (e.touches.length >= 2) {
    const a = { x: e.touches[0].clientX, y: e.touches[0].clientY }, b = { x: e.touches[1].clientX, y: e.touches[1].clientY };
    pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: earthZoom };
    drag = null; return;
  }
  const t = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  drag = { x: t.x, y: t.y, moved: 0 };
}
function onTouchMove(e) {
  if (pinch && e.touches.length >= 2) {
    e.preventDefault && e.preventDefault();
    const a = { x: e.touches[0].clientX, y: e.touches[0].clientY }, b = { x: e.touches[1].clientX, y: e.touches[1].clientY };
    const dd = Math.hypot(a.x - b.x, a.y - b.y);
    earthZoom = Math.max(0.5, Math.min(4, pinch.zoom * dd / pinch.d));
    return;
  }
  if (!drag || !e.touches.length) return;
  e.preventDefault && e.preventDefault();
  const p = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  const dx = p.x - drag.x, dy = p.y - drag.y;
  drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));

  if (state.view === 'earth') { state.t -= dx * 1800000; drag.x = p.x; return; }
  drag.x = p.x; drag.y = p.y;
}
function onTouchEnd(e) {
  if (pinch && (!e.touches || e.touches.length < 2)) pinch = null;
  drag = null;
}

// 鼠标事件适配器
function mouseToTouch(e) { return { clientX: e.clientX, clientY: e.clientY }; }
function onMouseDown(e) { if (!isUI(e.target)) onTouchStart({ touches: [mouseToTouch(e)] }); }
function onMouseMove(e) { if (drag) { onTouchMove({ touches: [mouseToTouch(e)] }); e.preventDefault(); } }
function onMouseUp(e) { onTouchEnd({ touches: [] }); }
function onWheel(e) {
  if (isUI(e.target)) return;
  e.preventDefault();
  earthZoom = Math.max(0.5, Math.min(4, earthZoom * (e.deltaY > 0 ? 0.92 : 1.08)));
}
dom.onDocument('touchstart', onTouchStart, { passive: false });
dom.onDocument('touchmove', onTouchMove, { passive: false });
dom.onDocument('touchend', onTouchEnd, { passive: true });
dom.onDocument('touchcancel', () => { pinch = null; drag = null; }, { passive: true });
dom.onDocument('mousedown', onMouseDown);
dom.onDocument('mousemove', onMouseMove);
dom.onDocument('mouseup', onMouseUp);
dom.onDocument('wheel', onWheel, { passive: false });

// ========== 信息卡 ==========
dom.getElementById('cardClose').onclick = () => { dom.getElementById('cardMask').style.display = 'none'; };
dom.getElementById('cardMask').onclick = (e) => { if (e.target === dom.getElementById('cardMask')) dom.getElementById('cardMask').style.display = 'none'; };

// 月亮信息卡
dom.onDocument('click', (e) => {
  if (state.view !== 'earth' || !window._moonXY) return;
  if (isUI(e.target)) return;
  if (Math.hypot(e.clientX - window._moonXY.x, e.clientY - window._moonXY.y) > window._moonXY.r + 20) return;
  const d = dnum(dispT);
  const _cd = new Date(dispT + tz.min * 60000);
  const _cl = solarToLunar(_cd.getUTCFullYear(), _cd.getUTCMonth()+1, _cd.getUTCDate());
  const ph = moonPhase(d, _cl ? _cl.day : null);
  dom.getElementById('cardTitle').textContent = '🌙 月球';
  dom.getElementById('cardBody').innerHTML =
    '<div class="row"><span>月相</span><span class="val">' + ph.name + '</span></div>' +
    '<div class="row"><span>月龄</span><span class="val">' + ph.age.toFixed(1) + ' 天</span></div>' +
    '<div class="row"><span>照亮</span><span class="val">' + Math.round(ph.illum * 100) + '%</span></div>' +
    '<div class="row"><span>月地距</span><span class="val">' + moonDistKm(d).toLocaleString() + ' km</span></div>' +
    '<div class="row"><span>直径</span><span class="val">3,474 km</span></div>' +
    '<div class="row"><span>黄经差</span><span class="val">' + ph.el.toFixed(1) + '°</span></div>' +
    '<div class="row"><span>周期天数</span><span class="val">' + (ph.age % SYN).toFixed(1) + '</span></div>' +
    '<div class="note">地球唯一的天然卫星，潮汐锁定，约 27.3 天绕地一周。</div>';
  window.TimeviewCards.show(dom.getElementById('cardMask'));
});

// ========== 命理/历法 ==========
const API_URL = new URL('api/fortune', document.baseURI).href;
let _fortBuf = '', _fortFlushed = '', _fortTimer = null;

function flushFort(force) {
  if (_fortBuf === _fortFlushed && !force) return;
  _fortFlushed = _fortBuf;
  dom.getElementById('fortText').textContent = _fortBuf;
  dom.getElementById('fortLoading').style.display = 'none';
  const card = dom.getElementById('fortMask');
  if (card.style.display === 'none') window.TimeviewCards.show(card);
}

function startFortune() {
  _fortBuf = ''; _fortFlushed = '';
  dom.getElementById('fortText').textContent = '';
  dom.getElementById('fortLoading').style.display = 'flex';
  dom.getElementById('fortMask').style.display = 'none';
  if (_fortTimer) clearInterval(_fortTimer);
  _fortTimer = setInterval(() => flushFort(), 90);

  // 传 ts + tzMin 让服务端 computeAstro() 统一计算（含时辰、星座、行星黄经）
  const data = {
    ts: dispT, tzMin: tz.min, mode: 'almanac'
  };

  fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data })
  }).then(async r => {
    if (!r.body || !r.body.getReader) { const t = await r.text(); _fortBuf = t; flushFort(true); return; }
    const reader = r.body.getReader(), decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      text.split('\n').forEach(line => {
        if (!line.startsWith('data:')) return;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try { const j = JSON.parse(payload); if (j.content) _fortBuf += j.content; } catch (e) {}
      });
    }
    flushFort(true);
    if (_fortTimer) { clearInterval(_fortTimer); _fortTimer = null; }
  }).catch(e => { _fortBuf = '⚠️ ' + e.message; flushFort(true); });
}
dom.getElementById('fortClose').onclick = () => { dom.getElementById('fortMask').style.display = 'none'; };

// ========== 底部栏功能按钮 ==========
dom.getElementById('btnHemi').onclick = () => {
  state.hemi *= -1;
  dom.getElementById('btnHemi').textContent = state.hemi > 0 ? '🧭 北' : '🧭 南';
  loadEarthPole();
};
dom.getElementById('btnCities').onclick = () => {
  showCities = !showCities;
  dom.getElementById('btnCities').style.color = showCities ? '#5fd6f0' : '#4d6a80';
};
dom.getElementById('btnSkin').onclick = (e) => {
  e.stopPropagation();
  const popup = dom.getElementById('skinPopup');
  if (popup.style.display !== 'none') { popup.style.display = 'none'; return; }
  const rect = e.currentTarget.getBoundingClientRect();
  popup.style.left = Math.max(8, rect.left) + 'px';
  popup.style.transform = 'none';
  popup.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
  popup.style.display = 'block';
  // 防溢出：超出屏幕右边界时左移
  var _pw = popup.offsetWidth, _ml = window.innerWidth - _pw - 8;
  if (_pw && (parseFloat(popup.style.left) || 0) > _ml) popup.style.left = Math.max(8, _ml) + 'px';
  dom.querySelectorAll('.skin-opt').forEach(o => o.classList.toggle('on', o.dataset.skin === curSkin));
};
dom.querySelectorAll('.skin-opt').forEach(el => {
  el.onclick = () => {
    curSkin = el.dataset.skin;
    document.body.classList.toggle('golden-skin', curSkin === 'golden');
    dom.getElementById('btnSkin').textContent = '🌐 ' + SKIN_NAMES[curSkin];
    dom.querySelectorAll('.skin-opt').forEach(o => o.classList.toggle('on', o.dataset.skin === curSkin));
    loadEarthPole();
    dom.getElementById('skinPopup').style.display = 'none';
  };
});
dom.getElementById('btnFortune').onclick = () => { startFortune(); };
dom.getElementById('btnGuide').onclick = () => { showGuide(0); };

// ========== 操作引导 ==========
const guideSteps = [
  { title: '地球表盘', desc: '左右拖动地球可拨转时间\n双指捏合缩放\n点月球查看详情' },
  { title: '快捷功能', desc: '底部横条右侧图标：\n🧭 切换南/北半球\n🌐 切换卫星/行政/卡通\n✨ 历法 🔊 音效 ❓ 引导' },
  { title: '时间控制台', desc: '底部面板控制时间快慢\n点击日期可跳转\n⚡ 调整时间速度' },
  { title: '解读星空历法', desc: 'AI 实时解读天文历法\n月相 · 节气 · 行星 · 星空\n点击底部 ✨ 即可' }
];
let guideStep = 0;
function showGuide(step) {
  guideStep = step;
  const s = guideSteps[step];
  dom.getElementById('guideTitle').textContent = (step + 1) + '. ' + s.title;
  dom.getElementById('guideDesc').textContent = s.desc;
  let dots = '';
  guideSteps.forEach((_, i) => { dots += '<span class="dot' + (i === step ? ' on' : '') + '"></span>'; });
  dom.getElementById('guideDots').innerHTML = dots;
  dom.getElementById('guidePrev').style.display = step > 0 ? '' : 'none';
  dom.getElementById('guideNext').textContent = step >= guideSteps.length - 1 ? '开始体验' : '下一步 ›';
  dom.getElementById('guideOverlay').style.display = 'block';
  dom.getElementById('guideCard').style.display = 'block';
  setView('earth');
}
function closeGuide() {
  dom.getElementById('guideOverlay').style.display = 'none';
  dom.getElementById('guideCard').style.display = 'none';
  localStorage.setItem('guideSeen', '1');
  if (state.view !== 'earth') setView('earth');
}
dom.getElementById('guideNext').onclick = () => { guideStep >= guideSteps.length - 1 ? closeGuide() : showGuide(guideStep + 1); };
dom.getElementById('guidePrev').onclick = () => { if (guideStep > 0) showGuide(guideStep - 1); };
dom.getElementById('guideSkip').onclick = closeGuide;
dom.getElementById('guideOverlay').onclick = closeGuide;

// ========== 启动 ==========
// 从太阳视角跳转过来时，带入日期/时间（URL ?t=<ms>）
(function applyIncomingTime() {
  const m = location.search.match(/[?&]t=(-?\d+)/);
  if (!m) return;
  const t = parseInt(m[1], 10);
  if (isNaN(t)) return;
  state.t = t;
  dispT = t;
  anchorT = t;
  dom.getElementById('pPlay').textContent = state.playing ? '❚❚' : '▶';
})();
resize();
// 默认进入地球视图
setView('earth');
// 首次引导（屏保模式下不弹）



function resetScreensaverToNow() {
  const restarting = new URLSearchParams(location.search).get('restart') === '1';
  if (!document.body.classList.contains('scrsv') && !restarting) return;
  if (restarting) { state.playing = true; try { sessionStorage.setItem('tv-clock-paused','0'); } catch (_) {} }
  setView('earth'); state.hemi = 1; earthZoom = 1; showCities = true;
  tzIdx = 0; tz = TIMEZONES[0]; inertia = 0; tlDrag = false;
  dom.getElementById('pNow').click();
  dom.getElementById('spdBtn').textContent = '⚡ 秒/秒 ▾';
  dom.querySelectorAll('.spd-opt[data-u]').forEach(o => o.classList.toggle('on', o.dataset.u === 'sec'));
  dom.getElementById('tzBtn').textContent = '🕓 ' + tz.label;
  dom.getElementById('btnHemi').textContent = '🧭 北';
  dom.getElementById('btnCities').style.color = '#5fd6f0';
  loadEarthPole();
}
dom.onWindow('timeview:intro-finished', resetScreensaverToNow);
if (!window.introActive) resetScreensaverToNow();
let courseMoonMonthStart = null;
function showCourseMoon(value) {
  const dayMs = 86400000;
  const lunarAt = ts => {
    const local = new Date(ts + 480 * 60000);
    return solarToLunar(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
  };
  if (courseMoonMonthStart === null) {
    const local = new Date(state.t + 480 * 60000);
    const noon = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 4);
    const lunar = lunarAt(noon);
    courseMoonMonthStart = noon - (lunar.day - 1) * dayMs;
  }
  const monthStart = courseMoonMonthStart;
  const index = Math.max(0, Math.min(7, Math.trunc(Number(value) || 0)));
  let offset = [1, 3, 8, 11, 15, 18, 23, 26][index] - 1;
  if (value === 'cycle') {
    // Replaying this cue stays on the next month's first day.
    offset = lunarAt(monthStart + 29 * dayMs).day === 1 ? 29 : 30;
  }
  const ts = monthStart + offset * dayMs;
  course.setTime(ts);
  courseMoonMonthStart = monthStart;
  setView('earth'); inertia = 0; tlDrag = false;
  curUnit = 'sec'; state.spd = SPD.sec;
  dom.getElementById('spdBtn').textContent = '⚡ 秒/秒 ▾';
  dom.querySelectorAll('.spd-opt[data-u]').forEach(o => o.classList.toggle('on', o.dataset.u === 'sec'));
  const lunar = lunarAt(ts), phase = moonPhase(dnum(ts), lunar.day);
  return {date: new Date(ts + 480 * 60000).toISOString().slice(0, 10),
    lunar: lunar.monthName + lunar.dayName, el: phase.el};
}
const course = {
  reset: () => { setView('earth'); earthZoom=1; inertia=0; tlDrag=false; },
  time: () => state.t,
  setTime: (ts) => {
    if (!Number.isFinite(ts)) throw new Error('无效日期');
    courseMoonMonthStart = null;
    refreshZones(ts);
    tzIdx = 0; tz = TIMEZONES[0];
    dom.getElementById('tzBtn').textContent = '🕓 ' + tz.label;
    state.t = ts; dispT = ts; anchorT = ts;
    dom.getElementById('pPlay').textContent = state.playing ? '❚❚' : '▶';
  },
  moon: showCourseMoon,
  now: () => { courseMoonMonthStart = null; dom.getElementById('pNow').click(); }
};
async function prepare() {
  await Promise.all([loadEarthPole(),loadImage(moonImg,TEXBASE+'moon.jpg'),loadImage(changEIcon,'textures/change-orbiter.svg?v=3.57')]);
  moonReady=true;
  const day=dnum(dispT),date=new Date(dispT+tz.min*60000);
  refreshZones(dispT);drawEarth(day,date);updateHUD(day,date);
  dom.getElementById('einfo').style.display='';
  // Let the browser commit the decoded Earth canvas behind the loading screen.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

};

dom.getElementById('tabSolar').onclick=()=>switchCalTab('solar');
dom.getElementById('tabLunar').onclick=()=>switchCalTab('lunar');
dom.getElementById('dpPrev').onclick=()=>dpNav(-1);
dom.getElementById('dpNext').onclick=()=>dpNav(1);
let guideTimer;
return {
  course, prepare,
  transitionTarget(){const {x,y,r}=earthGeometry();return {x,y,r};},
  drawStill(){resize();drawEarth(dnum(dispT),new Date(dispT+tz.min*60000));},
  transitionFrame(){
    resize();drawEarth(dnum(dispT),new Date(dispT+tz.min*60000));
    // Fade clock/city annotations off the travelling globe, retaining the same
    // map and orientation. This uses the image already decoded for this skin.
    const globe=document.createElement('canvas');globe.width=globe.height=Math.min(768,Math.max(64,Math.ceil(earthAnchor.r*2*DPR)));
    const g=globe.getContext('2d'),r=globe.width/2;
    g.translate(r,r);g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.clip();g.rotate(earthMapRotation);
    g.drawImage(isEarthReady()?getEarthImg():earthTex,-r*1.08,-r*1.08,r*2.16,r*2.16);
    return window.TimeviewTransition.capture(cv,earthAnchor,{feather:true,globe});
  },
  snapshot:()=>({time:state.t,playing:state.playing,unit:curUnit}),
  restore(value){
    state.t=dispT=anchorT=value.time;state.playing=value.playing;
    curUnit=Object.hasOwn(SPD,value.unit)?value.unit:'sec';state.spd=SPD[curUnit];
    dom.getElementById('pPlay').textContent=state.playing?'❚❚':'▶';
    dom.getElementById('spdBtn').textContent='⚡ '+({sec:'秒',hour:'时',day:'日',month:'月',year:'年'}[curUnit])+'/秒 ▾';
    dom.querySelectorAll('.spd-opt[data-u]').forEach(el=>el.classList.toggle('on',el.dataset.u===curUnit));
    refreshZones(state.t);updateHUD(dnum(state.t),new Date(state.t+tz.min*60000));
  },
  resume(){
    if(active)return;active=true;lastT=performance.now();resize();
    document.body.classList.toggle('golden-skin',curSkin==='golden');
    animationFrame=requestAnimationFrame(frame);
    if(!localStorage.getItem('guideSeen')&&!document.body.classList.contains('scrsv'))guideTimer=setTimeout(()=>{if(active)showGuide(0);},1500);
  },
  suspend(){active=false;cancelAnimationFrame(animationFrame);clearTimeout(guideTimer);drag=pinch=null;inertia=0;tlDrag=false;document.body.classList.remove('golden-skin');},
  diagnostics:()=>({active,frame:animationFrame,zoom:earthZoom,hemisphere:state.hemi,skin:curSkin,earth:earthAnchor?{...earthAnchor}:null,
    cities:window.TimeviewMobile?.active()&&showCities?{mode:mobileCityLayout.mode,labels:mobileCityLayout.labels.map(l=>({...l,box:{...l.box}}))}:null})
};

};
