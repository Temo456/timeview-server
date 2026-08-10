// 天文算法（移植自 MVP 原型）
const RAD = Math.PI / 180;
const rev = x => { x %= 360; return x < 0 ? x + 360 : x; };
const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
const dnum = ms => (ms - J2000) / 86400000;

// 太阳几何黄经（低精度，可视化足够）
function sunLon(d) {
  d += 1.5;
  const w = 282.9404 + 4.70935e-5 * d,
    e = 0.016709 - 1.151e-9 * d,
    M = rev(356.0470 + 0.9856002585 * d);
  const Mr = M * RAD,
    E = M + (e / RAD) * Math.sin(Mr) * (1 + e * Math.cos(Mr)),
    Er = E * RAD;
  return rev(Math.atan2(Math.sqrt(1 - e * e) * Math.sin(Er), Math.cos(Er) - e) / RAD + w);
}

const PLANETS = [
  { n: "水星", P: 0.2408, L0: 252.25 },
  { n: "金星", P: 0.6152, L0: 181.98 },
  { n: "地球", P: 1.0000, L0: 100.46 },
  { n: "火星", P: 1.8808, L0: 355.43 },
  { n: "木星", P: 11.862, L0: 34.35 },
  { n: "土星", P: 29.457, L0: 49.94 },
  { n: "天王星", P: 84.011, L0: 313.23 },
  { n: "海王星", P: 164.79, L0: 304.88 },
  { n: "冥王星", P: 247.94, L0: 238.93 }
];

// 行星平黄经（圆轨道近似）
const planetLon = (p, d) => rev(p.L0 + (360 / (p.P * 365.25)) * d);

const SYN = 29.530588853; // 朔望月(天)
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
function moonPhase(d) {
  const el = rev(moonLon(d) - sunLon(d)), illum = (1 - Math.cos(el * RAD)) / 2, age = SYN * el / 360;
  const name = el < 22.5 || el >= 337.5 ? "新月" : el < 67.5 ? "峨眉月" : el < 112.5 ? "上弦月"
    : el < 157.5 ? "盈凸月" : el < 202.5 ? "满月" : el < 247.5 ? "亏凸月" : el < 292.5 ? "下弦月" : "残月";
  return { el, illum, age, name };
}
const TERMS = ["春分", "清明", "谷雨", "立夏", "小满", "芒种", "夏至", "小暑", "大暑", "立秋", "处暑", "白露",
  "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至", "小寒", "大寒", "立春", "雨水", "惊蛰"];
function solarTerm(d) {
  const SL = rev(sunLon(d)), i = Math.floor(SL / 15) % 24, within = SL - i * 15, perDay = 360 / 365.2422;
  return { name: TERMS[i], days: Math.floor(within / perDay) + 1, next: TERMS[(i + 1) % 24],
    toNext: Math.max(1, Math.round((15 - within) / perDay)), idx: i, SL };
}

const TIMEZONES = [{ label: "UTC", min: 0 }, { label: "UTC+8 北京", min: 480 }];

const SHICHEN = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const SHICHEN_RANGE = ["23-1", "1-3", "3-5", "5-7", "7-9", "9-11", "11-13", "13-15", "15-17", "17-19", "19-21", "21-23"];
function shifted(ms, tzMin) { return new Date(ms + (tzMin || 0) * 60000); }
function shichen(ms, tz) {
  const dt = shifted(ms, tz ? tz.min : 0);
  const h = dt.getUTCHours();
  const i = Math.floor(((h + 1) % 24) / 2) % 12;
  return { zhi: SHICHEN[i], name: SHICHEN[i] + "时", range: SHICHEN_RANGE[i], idx: i };
}

const WK = ["日", "一", "二", "三", "四", "五", "六"];
function fmtDate(ms, tz) {
  tz = tz || TIMEZONES[0];
  const dt = shifted(ms, tz.min), p = n => String(n).padStart(2, "0");
  let y = dt.getUTCFullYear();
  const ys = y < 0 ? "公元前" + (-y + 1) : String(y);
  return ys + "-" + p(dt.getUTCMonth() + 1) + "-" + p(dt.getUTCDate()) + " " +
    p(dt.getUTCHours()) + ":" + p(dt.getUTCMinutes()) + ":" + p(dt.getUTCSeconds()) + (tz.label ? (" " + tz.label) : "");
}

module.exports = {
  RAD, rev, J2000, dnum, sunLon, PLANETS, planetLon,
  fmtDate, TIMEZONES, SYN, moonLon, moonPhase, TERMS, solarTerm,
  SHICHEN, SHICHEN_RANGE, shichen
};
