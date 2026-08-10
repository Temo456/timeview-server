// 自托管：仅用 Node 内置模块，无需 npm install。
// 提供静态页面 + /api/health + /api/chat（知识库检索 + 可选 LLM）+ /api/archives
const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const tls = require("tls");

const PORT = parseInt(process.env.PORT || "80", 10);
const ROOT = __dirname;
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_BASE_URL = (process.env.LLM_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");
const LLM_MODEL = process.env.LLM_MODEL || "deepseek-chat";
// 命理推演专用 LLM（留空则复用上面的通用 LLM）
const FORTUNE_API_KEY = process.env.FORTUNE_API_KEY || "";
const FORTUNE_BASE_URL = (process.env.FORTUNE_BASE_URL || "").replace(/\/+$/, "");
const FORTUNE_MODEL = process.env.FORTUNE_MODEL || "";
// 未单独配置时，命理推演复用通用 LLM
const _fk = FORTUNE_API_KEY || LLM_API_KEY;
const _fu = FORTUNE_BASE_URL || LLM_BASE_URL;
const _fm = FORTUNE_MODEL || LLM_MODEL;
const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || "";
const BIND = process.env.BIND || "0.0.0.0";
// 解读模式开关：almanac=天文历法科普（默认，合规）；fortune=命理推演（仅在非微信渠道/过审后开启）
const FORTUNE_MODE = (process.env.FORTUNE_MODE || "almanac").toLowerCase() === "fortune" ? "fortune" : "almanac";

// 天文/历法计算（与小程序复用同一套 astro.js / lunar.js，保证两端结果完全一致）
const A = require("./astro");
const L = require("./lunar");
function zodiacOf(m, d) {
  const last = [19, 18, 20, 19, 20, 21, 22, 22, 21, 22, 21, 20];
  const signs = ["摩羯", "水瓶", "双鱼", "白羊", "金牛", "双子", "巨蟹", "狮子", "处女", "天秤", "天蝎", "射手", "摩羯"];
  return signs[d <= last[m - 1] ? m - 1 : m] + "座";
}
// 由时间戳(ts，UTC 毫秒)+ 时区分钟偏移，算出与小程序一致的天文历法数据
function computeAstro(ts, tzMin) {
  const tz = { min: tzMin || 0, label: "" };
  const d = A.dnum(ts);
  const dt = new Date(ts + (tz.min || 0) * 60000);
  const ph = A.moonPhase(d), st = A.solarTerm(d), sc = A.shichen(ts, tz);
  const yearGZ = L.ganzhiYear ? L.ganzhiYear(dt.getUTCFullYear()) : "";
  const lunarStr = L.fmtLunar ? L.fmtLunar(ts, tz) : "";
  return {
    dateText: A.fmtDate(ts, tz), lunar: lunarStr || (yearGZ + "年"),
    shichen: sc.name + "（" + sc.range + "）", yearGZ: yearGZ,
    solarTerm: st.name, termToNext: st.toNext,
    moonPhase: ph.name, moonAge: ph.age.toFixed(1), moonIllum: Math.round(ph.illum * 100),
    zodiac: zodiacOf(dt.getUTCMonth() + 1, dt.getUTCDate()),
    sunLon: A.sunLon(d).toFixed(1),
    mercuryLon: A.planetLon(A.PLANETS[0], d).toFixed(1), venusLon: A.planetLon(A.PLANETS[1], d).toFixed(1),
    marsLon: A.planetLon(A.PLANETS[3], d).toFixed(1), jupiterLon: A.planetLon(A.PLANETS[4], d).toFixed(1),
    saturnLon: A.planetLon(A.PLANETS[5], d).toFixed(1), uranusLon: A.planetLon(A.PLANETS[6], d).toFixed(1),
    neptuneLon: A.planetLon(A.PLANETS[7], d).toFixed(1)
  };
}

let KB = [];
try { KB = JSON.parse(fs.readFileSync(path.join(ROOT, "knowledge.json"), "utf-8")); } catch (e) {}
const DATA_DIR = process.env.DATA_DIR || ROOT;
const ARCH = path.join(DATA_DIR, "archives.json");
function loadArch() { try { return JSON.parse(fs.readFileSync(ARCH, "utf-8")); } catch (e) { return []; } }
function saveArch(a) { try { fs.writeFileSync(ARCH, JSON.stringify(a)); } catch (e) {} }

// 子路径部署支持：注入 <base href="/timeview/">，前端用相对路径即可
const BASE = (process.env.BASE_PATH || "").replace(/\/+$/, "");
const BHREF = (BASE || "") + "/";
function injectBase(html){ return html.replace(/<head([^>]*)>/i, '<head$1><base href="' + BHREF + '">'); }
let LANDING = "", APP = "", RELEASE = "", WALLPAPER = "";
try { LANDING = injectBase(fs.readFileSync(path.join(ROOT, "landing.html"), "utf-8")); } catch (e) {}
try { APP = injectBase(fs.readFileSync(path.join(ROOT, "index.html"), "utf-8")); } catch (e) {}
try { RELEASE = injectBase(fs.readFileSync(path.join(ROOT, "release.html"), "utf-8")); } catch (e) {}
try { WALLPAPER = injectBase(fs.readFileSync(path.join(ROOT, "wallpaper.html"), "utf-8")); } catch (e) {}
function sendHtml(res, html){ res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(Buffer.from(html)); }

const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".ico":"image/x-icon",
  ".wav":"audio/wav", ".mp3":"audio/mpeg", ".webp":"image/webp", ".apk":"application/vnd.android.package-archive" };

function sendJson(res, obj, code = 200) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(b);
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = ""; req.on("data", c => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({}); } });
  });
}
function retrieve(message) {
  const terms = message.replace(/[，。,.\?？!！、；;：:\s]+/g, " ").split(" ").filter(w => w.length >= 2).slice(0, 6);
  const hits = [];
  for (const k of KB) {
    const hay = (k.title + k.content + (k.tags || ""));
    if (terms.some(t => hay.indexOf(t) >= 0)) hits.push(k);
    if (hits.length >= 5) break;
  }
  return hits;
}
function dechunkBuf(b){ const parts=[]; let i=0; while(i<b.length){ const j=b.indexOf("\r\n",i); if(j<0)break; const len=parseInt(b.slice(i,j).toString("latin1").trim(),16); if(isNaN(len)||len===0)break; parts.push(b.slice(j+2,j+2+len)); i=j+2+len+2; } return Buffer.concat(parts); }
// 纯内置模块的 HTTPS POST，支持 HTTP CONNECT 代理（解决 fetch 不认代理 + 国内访问）
function postJSON(urlStr, headers, bodyStr, proxy){
  return new Promise((resolve,reject)=>{
    let done=false; const fail=e=>{ if(!done){done=true;reject(e);} };
    const u=new URL(urlStr); const host=u.hostname, port=parseInt(u.port||"443",10), pth=u.pathname+(u.search||"");
    const h=Object.assign({}, headers, {"Host":u.host,"Content-Type":"application/json","Content-Length":Buffer.byteLength(bodyStr),"Connection":"close"});
    let head="POST "+pth+" HTTP/1.1\r\n"; for(const k in h) head+=k+": "+h[k]+"\r\n"; head+="\r\n";
    const onTls=(sock)=>{
      sock.write(head); sock.write(bodyStr);
      const chunks=[]; sock.on("data",d=>chunks.push(d));
      sock.on("end",()=>{ try{
        const buf=Buffer.concat(chunks); const sep=buf.indexOf("\r\n\r\n");
        const hd=buf.slice(0,sep).toString("latin1"); let body=buf.slice(sep+4);
        if(/transfer-encoding:\s*chunked/i.test(hd)) body=dechunkBuf(body);
        done=true; resolve(JSON.parse(body.toString("utf-8")));
      }catch(e){ fail(new Error("bad response: "+e.message)); } });
      sock.on("error",fail);
    };
    const timer=setTimeout(()=>fail(new Error("timeout")),60000);
    const clear=()=>clearTimeout(timer);
    if(proxy){
      const pu=new URL(proxy.indexOf("://")<0?("http://"+proxy):proxy);
      const sk=net.connect(parseInt(pu.port||"80",10), pu.hostname, ()=>{ sk.write("CONNECT "+host+":"+port+" HTTP/1.1\r\nHost: "+host+":"+port+"\r\n\r\n"); });
      let est=false, pb="";
      sk.on("data",d=>{ if(est)return; pb+=d.toString("latin1"); if(pb.indexOf("\r\n\r\n")>=0){ clear(); if(/^HTTP\/1\.[01] 200/.test(pb)){ est=true; const ts=tls.connect({socket:sk,servername:host},()=>onTls(ts)); ts.on("error",fail);} else { fail(new Error("proxy CONNECT failed: "+pb.split("\r\n")[0])); sk.destroy(); } } });
      sk.on("error",fail);
    } else {
      const ts=tls.connect({host,port,servername:host},()=>{ clear(); onTls(ts); }); ts.on("error",fail);
    }
  });
}
// 流式 POST：逐行回调（用于 SSE 推送），与 postJSON 共享 TLS/代理逻辑
function postJSONStream(urlStr, headers, bodyStr, proxy, onLine) {
  return new Promise((resolve, reject) => {
    let done = false; const fail = e => { if (!done) { done = true; reject(e); } };
    const u = new URL(urlStr); const host = u.hostname, port = parseInt(u.port || "443", 10), pth = u.pathname + (u.search || "");
    const h = Object.assign({}, headers, { "Host": u.host, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr), "Connection": "close" });
    let head = "POST " + pth + " HTTP/1.1\r\n"; for (const k in h) head += k + ": " + h[k] + "\r\n"; head += "\r\n";
    let headerDone = false, leftover = "";
    const onTls = (sock) => {
      sock.write(head); sock.write(bodyStr);
      sock.on("data", raw => {
        if (headerDone) { parseSSE(raw); return; }
        leftover += raw.toString("latin1");
        const sep = leftover.indexOf("\r\n\r\n");
        if (sep < 0) return;
        const hdr = leftover.slice(0, sep);
        headerDone = true;
        const rest = Buffer.from(leftover.slice(sep + 4), "latin1");
        leftover = "";
        if (/transfer-encoding:\s*chunked/i.test(hdr)) { chunkedBuf = Buffer.alloc(0); parseChunked(rest); } else { parseSSE(rest); }
      });
      sock.on("end", () => { if (!done) { done = true; resolve(); } });
      sock.on("error", fail);
    };
    let chunkedBuf = Buffer.alloc(0);
    const parseChunked = (buf) => {
      chunkedBuf = Buffer.concat([chunkedBuf, buf]);
      while (true) {
        const nl = chunkedBuf.indexOf("\r\n");
        if (nl < 0) break;
        const len = parseInt(chunkedBuf.slice(0, nl).toString("latin1").trim(), 16);
        if (isNaN(len) || len === 0) { if (len === 0) { if (!done) { done = true; resolve(); } } break; }
        if (chunkedBuf.length < nl + 2 + len + 2) break;
        const lineBuf = chunkedBuf.slice(nl + 2, nl + 2 + len);
        chunkedBuf = chunkedBuf.slice(nl + 2 + len + 2);
        parseSSE(lineBuf);
      }
    };
    const parseSSE = (buf) => {
      leftover += buf.toString("utf-8");
      const lines = leftover.split("\n");
      leftover = lines.pop();
      for (const line of lines) { const trimmed = line.trim(); if (trimmed) onLine(trimmed); }
    };
    const timer = setTimeout(() => fail(new Error("timeout")), 120000);
    const clear = () => clearTimeout(timer);
    if (proxy) {
      const pu = new URL(proxy.indexOf("://") < 0 ? ("http://" + proxy) : proxy);
      const sk = net.connect(parseInt(pu.port || "80", 10), pu.hostname, () => { sk.write("CONNECT " + host + ":" + port + " HTTP/1.1\r\nHost: " + host + ":" + port + "\r\n\r\n"); });
      let est = false, pb = "";
      sk.on("data", d => { if (est) return; pb += d.toString("latin1"); if (pb.indexOf("\r\n\r\n") >= 0) { clear(); if (/^HTTP\/1\.[01] 200/.test(pb)) { est = true; const ts = tls.connect({ socket: sk, servername: host }, () => onTls(ts)); ts.on("error", fail); } else { fail(new Error("proxy CONNECT failed: " + pb.split("\r\n")[0])); sk.destroy(); } } });
      sk.on("error", fail);
    } else {
      const ts = tls.connect({ host, port, servername: host }, () => { clear(); onTls(ts); }); ts.on("error", fail);
    }
  });
}
async function callLLM(messages){
  const bodyStr=JSON.stringify({model:LLM_MODEL, messages, temperature:0.5, stream:false});
  const j=await postJSON(LLM_BASE_URL.replace(/\/+$/,"")+"/chat/completions", {"Authorization":"Bearer "+LLM_API_KEY}, bodyStr, PROXY);
  if(j.error) throw new Error(j.error.message||JSON.stringify(j.error));
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content)||"";
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const p = u.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" });
    return res.end();
  }

  if (p === "/api/health") return sendJson(res, { ok: true, ai: !!LLM_API_KEY, kb: KB.length, model: LLM_MODEL, fortune: _fm, fortuneMode: FORTUNE_MODE });

  if (p === "/api/chat" && req.method === "POST") {
    try {
      const b = await readBody(req);
      const message = (b.message || "").toString().trim();
      const history = Array.isArray(b.history) ? b.history : [];
      if (!message) return sendJson(res, { error: "empty" }, 400);
      const kb = retrieve(message);
      const ctx = kb.map(k => "【" + k.title + "】" + k.content).join("\n");
      if (!LLM_API_KEY) {
        return sendJson(res, { answer: "（未配置 LLM API Key，仅返回知识库匹配）\n" + (ctx || "无匹配条目"), sources: kb.map(k => k.title) });
      }
      const sys = "你是『时间景观』里的天文向导，用简洁准确的中文回答天文、历法、星座、行星、月相、三体等问题。优先使用下面【知识库】内容；没覆盖的用常识谨慎回答并说明。命理类仅作娱乐。\n\n【知识库】\n" + (ctx || "（无匹配）");
      const messages = [{ role: "system", content: sys }];
      history.slice(-6).forEach(h => messages.push({ role: h.role === "user" ? "user" : "assistant", content: String(h.content || "").slice(0, 600) }));
      messages.push({ role: "user", content: message.slice(0, 800) });
      const answer = await callLLM(messages);
      return sendJson(res, { answer: answer || "（暂无回答）", sources: kb.map(k => k.title) });
    } catch (e) { return sendJson(res, { error: String(e && e.message || e) }, 500); }
  }

  // ===== 天文历法科普解读（SSE 流式输出）=====
  if (p === "/api/fortune" && req.method === "POST") {
    const b = await readBody(req);
    let d = b.data || b;
    // 若调用方只传时间戳(ts)，则服务端用同一套算法计算天文数据（H5 走此路径；
    // 小程序仍可直接传算好的字段——两者用的是同一份 astro.js，结果一致）
    if (d.ts) {
      const personal = { name: d.name, gender: d.gender, birthday: d.birthday, birthLunar: d.birthLunar, birthHour: d.birthHour, birthPlace: d.birthPlace, phone: d.phone, mode: d.mode };
      d = Object.assign(computeAstro(d.ts, d.tzMin || 0), personal);
    }
    if (!d.dateText) return sendJson(res, { error: "missing data" }, 400);
    if (!_fk) return sendJson(res, { error: "未配置 LLM API Key" }, 500);
    // 命理仅在 服务端开关=fortune 且 调用方未显式要求科普 时启用；
    // 小程序固定传 mode:'almanac'，因此即便服务端开了命理也只会拿到科普内容。
    const isDivine = FORTUNE_MODE === "fortune" && d.mode !== "almanac";

    // —— 模式一：天文历法科普（默认，合规）——
    const SYS_ALMANAC = [
      '你是一位天文与历法科普讲解员。请根据给定某一天的天文历法数据，向大众做一次准确、通俗、生动的天文与中国传统历法知识讲解。这是纯科普知识内容。',
      '',
      '【硬性红线】严禁出现任何运势、吉凶、宜忌、开运、招财、命理、八字、风水、占卜、起卦、星座性格/爱情/事业运、预测个人祸福等内容；不得对个人作任何预测或建议。只讲客观的天文现象与历法文化知识。',
      '',
      '【输出板块】（按顺序输出）：',
      '## 🌍 太阳与节气',
      '[根据太阳黄经与当令节气，讲解这天太阳在黄道上的位置、地球公转所处阶段，以及该节气的天文成因、昼夜长短与物候特征；说明距下一节气的天数]',
      '',
      '## 🌙 月相讲解',
      '[根据月相、月龄、照亮比例，科普月相的成因（日地月几何关系）、这天月亮大致升落与可观测时段、肉眼观测要点]',
      '',
      '## 🪐 行星位置',
      '[根据各行星黄经，介绍这天水金火木土等行星在黄道上的大致位置、是否适合观测、相关基础天文知识]',
      '',
      '## ✨ 星空看点',
      '[结合当令黄道星座与季节星空，介绍这一时段夜空中值得关注的亮星、星座或天象，并给出简单的观星小贴士]',
      '',
      '## 🗓️ 历法文化',
      '[结合公历、农历与干支纪年，科普中国传统阴阳合历的原理（朔望月、二十四节气、置闰等）以及与该日期/节气相关的天文历法文化小知识、古人观象授时的典故]',
      '',
      '---',
      '【要求】',
      '1. 必须紧扣给定的具体数据（太阳/行星黄经、月相、月龄、节气、农历干支等）展开，做到言之有据、严禁套话；',
      '2. 内容科学准确、通俗易懂、兼具趣味性与知识性；',
      '3. 全文总字数 800-1200 字；',
      '4. 通篇为天文历法科普，不得夹带任何运势/命理/占卜相关表述。'
    ].join('\n');

    // —— 模式二：命理推演（仅在 FORTUNE_MODE=fortune 时启用）——
    const SYS_DIVINE = [
      '你是一位融会贯通的中华命理大家，精通八字命理、紫微斗数、易经卦象、天文星象、姓名学（五格剖象/三才配置/汉字五行）、地理风水（方位五行/地域气运）、数字数理（号码五行/易经81数理）。请把以上各家学说有机融合，对用户进行一次详尽、专业、个性化的命理推演。',
      '',
      '【输出板块】（请按顺序输出，用户未提供的信息对应的板块整段省略，且不要提及信息缺失）：',
      '## 📋 命盘概要',
      '[综述当日干支、纳音五行、值日星宿、当令节气，并点明今日整体气场基调]',
      '',
      '## 🎋 生辰八字   ← 仅当提供出生日期时输出',
      '[依出生日期与时辰排出年柱、月柱、日柱、时柱四柱之干支与纳音（提供出生时辰则排全四柱，否则时柱从略并说明）；判定日主旺衰、五行喜用神与忌神；结合当日流日干支分析对命局的引动]',
      '',
      '## 👤 姓名命理   ← 仅当提供姓名时输出',
      '[逐字拆解姓名用字的五行属性与字义象征；推算三才五格（天格/人格/地格/外格/总格）的笔画数理与吉凶；分析姓名五行与八字喜用神是否相合、与当日五行的生克关系；指出姓名对性格、事业、人缘的暗示及补益方向]',
      '',
      '## 🌍 地理方位与风水   ← 仅当提供出生地点时输出',
      '[据出生地点判定其地理方位及对应五行与地域气运；结合山川水势分析其先天气场；给出今日有利方位、忌讳方位，以及适宜的居住/办公朝向与风水调理建议]',
      '',
      '## ☯ 五行分析',
      '[综合个人五行（若有姓名/地点）与当日五行，分析五行旺衰、相生相克与平衡之道，指出今日宜补何行、宜泄何行]',
      '',
      '## 🌟 星象解读',
      '[结合太阳、月亮及各行星黄经位置、月相、当令星座，细致解读天体格局对运势、情绪、决策的影响]',
      '',
      '## 📱 号码数理   ← 仅当提供手机号时输出',
      '[分析手机号整体及尾四位的数字五行与组合吉凶；以易经81数理/河洛数评断其数理意涵；点明该号码对财运、人际、事业的能量倾向与今日呼应]',
      '',
      '## 📊 综合运势',
      '评分：X/100',
      '',
      '**事业** ⭐⭐⭐⭐☆',
      '[结合上述各维度的具体分析，不要泛泛而谈]',
      '',
      '**财运** ⭐⭐⭐☆☆',
      '[分析]',
      '',
      '**感情** ⭐⭐⭐⭐⭐',
      '[分析]',
      '',
      '**健康** ⭐⭐⭐☆☆',
      '[分析]',
      '',
      '## 📅 今日宜忌',
      '宜：[列出 4-6 项，尽量结合个人信息]',
      '忌：[列出 4-6 项]',
      '',
      '## 🔮 开运锦囊',
      '[给出 4-6 条具体可执行的开运方法：幸运色、吉利方位、幸运数字、吉时、宜佩戴之物、宜做之事等，尽量与姓名/地点/号码呼应]',
      '',
      '## 📖 易经卦象',
      '[根据日期（及姓名笔画，若有）起卦，给出本卦与变卦的卦名、卦象，解读卦辞爻辞对今日的指引]',
      '',
      '---',
      '【要求】',
      '1. 必须紧扣用户提供的具体数据逐项展开，做到“千人千面”，严禁套话空话；',
      '2. 语言古雅而通俗，可适当引用古籍，但要让普通人读得懂；',
      '3. 每个板块内容充实、有理有据，全文总字数 1500-2500 字；',
      '4. 评分与星级须与文字分析一致；',
      '5. 末尾用一句温和的话提醒：命理仅供参考，命运掌握在自己手中。'
    ].join('\n');

    const ASTRO_DATA = '\n【当前天文历法数据】\n- 公历：' + d.dateText + '\n- 农历：' + (d.lunar||'') + '\n- 时辰：' + (d.shichen||'') + '\n- 年柱干支：' + (d.yearGZ||'') + '\n- 当前节气：' + (d.solarTerm||'') + '（距下一节气 ' + (d.termToNext||'') + ' 天）\n- 月相：' + (d.moonPhase||'') + '（月龄 ' + (d.moonAge||'') + ' 天，照亮 ' + (d.moonIllum||'') + '%）\n- 当前黄道星座：' + (d.zodiac||'') + '\n- 太阳黄经：' + (d.sunLon||'') + '°\n- 水星黄经：' + (d.mercuryLon||'') + '° | 金星黄经：' + (d.venusLon||'') + '° | 火星黄经：' + (d.marsLon||'') + '°\n- 木星黄经：' + (d.jupiterLon||'') + '° | 土星黄经：' + (d.saturnLon||'') + '°\n- 天王星黄经：' + (d.uranusLon||'') + '° | 海王星黄经：' + (d.neptuneLon||'') + '°\n';

    const FORTUNE_SYS = isDivine ? SYS_DIVINE : SYS_ALMANAC;
    let userMsg;
    if (isDivine) {
      let info = '【个人信息】\n';
      info += _has(d.name) ? ('- 姓名：' + d.name + '\n') : '';
      info += _has(d.gender) ? ('- 性别：' + d.gender + '\n') : '';
      info += _has(d.birthday) ? ('- 出生日期：' + d.birthday + (_has(d.birthLunar) ? ('（' + d.birthLunar + '）') : '') + '\n') : '';
      info += _has(d.birthHour) ? ('- 出生时辰：' + d.birthHour + '\n') : '';
      info += _has(d.birthPlace) ? ('- 出生地点：' + d.birthPlace + '\n') : '';
      info += _has(d.phone) ? ('- 手机号码：' + d.phone + '\n') : '';
      if (info === '【个人信息】\n') info = '';
      userMsg = info + ASTRO_DATA + '\n请综合个人信息与天文数据，进行详尽的个性化命理推演。';
    } else {
      userMsg = '请讲解以下这一天的天文与历法知识。\n' + ASTRO_DATA + '\n请据此进行天文与历法科普讲解。';
    }
    // SSE 响应头（X-Accel-Buffering:no 让 nginx 不缓冲，保证逐字流式下发）
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
      "access-control-allow-origin": "*"
    });
    if (res.flushHeaders) res.flushHeaders();
    // 先发一条注释帧，尽快建立连接、触发客户端 onChunkReceived
    res.write(": ok\n\n");
    const msgs = [{ role: "system", content: FORTUNE_SYS }, { role: "user", content: userMsg }];
    const bodyStr = JSON.stringify({ model: _fm, messages: msgs, temperature: isDivine ? 0.78 : 0.6, max_tokens: isDivine ? 4096 : 2048, stream: true });
    console.log("[skyread] streaming mode=" + FORTUNE_MODE + " " + _fu + " model=" + _fm);
    try {
      await postJSONStream(_fu + "/chat/completions", { "Authorization": "Bearer " + _fk }, bodyStr, PROXY, line => {
        if (!line.startsWith("data:")) return;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") { res.write("data: [DONE]\n\n"); return; }
        try {
          const j = JSON.parse(payload);
          const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
          if (delta) res.write("data: " + JSON.stringify({ content: delta }) + "\n\n");
        } catch (e) {}
      });
    } catch (e) { console.log("[fortune] stream error:", e.message); res.write("data: " + JSON.stringify({ error: e.message }) + "\n\n"); }
    res.end();
    return;
  }

  if (p === "/api/archives") {
    if (req.method === "GET") {
      const user = u.searchParams.get("user") || "guest";
      return sendJson(res, { items: loadArch().filter(x => x.user === user).slice(-50).reverse() });
    }
    if (req.method === "POST") {
      const b = await readBody(req);
      const a = loadArch();
      a.push({ id: Date.now(), user: (b.user || "guest").slice(0, 64), name: (b.name || "未命名档案").slice(0, 80), data: b.data || {}, created: Date.now() });
      saveArch(a);
      return sendJson(res, { ok: true });
    }
  }

  // HTML 路由（用内存缓存，已注入 <base>）
  if (p === "/" ) return sendHtml(res, LANDING);
  if (p === "/app" || p === "/app/") return sendHtml(res, APP);
  if (p === "/release" || p === "/release/") return sendHtml(res, RELEASE);
  if (p === "/wallpaper" || p === "/wallpaper/") return sendHtml(res, WALLPAPER);
  // 其它静态文件
  let fp = path.join(ROOT, decodeURIComponent(p));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(fp, (err, data) => {
    if (err) return sendHtml(res, LANDING);
    res.writeHead(200, { "content-type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
});
server.listen(PORT, BIND, () => console.log("time-view on " + BIND + ":" + PORT + "  AI=" + (!!LLM_API_KEY) + "  fortune=" + _fm + "  mode=" + FORTUNE_MODE + "  PROXY=" + (PROXY||"none") + "  KB=" + KB.length));
