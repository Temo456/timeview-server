/*
 * 时间景观 · AI 数字助理（阿远 & 阿星）直播解说模块
 * 共享：index.html（地球视角 / TIMEVIEW=earth）与 solar-system.html（太阳系视角 / TIMEVIEW=solar）。
 * 形态：右侧抽屉（默认收起）；话题手动切换；同一话题内阿远/阿星对话连续累积显示。
 * 问答：问题选择式——点选知识库里的问题，直接返回预设答案（无需大模型）。
 * 语音：服务端 /api/tts（小米 MiMo TTS）合成，男声→阿远、女声→阿星。
 */
(function () {
  'use strict';
  var VIEW = window.TIMEVIEW === 'solar' ? 'solar' : 'earth';

  var AYUAN = { id: 'ayuan', name: '阿远', tag: '理性·技术', voice: 'male' };
  var AXING = { id: 'axing', name: '阿星', tag: '感性·体验', voice: 'female' };

  var REFUSE = '这个问题暂时不在我们今天时间景观的科普讨论范围内，我们继续来看眼前正在实时演算的宇宙画面。';

  var EARTH_TOPICS = [
    { ayuan: '现在我们以北极上空的上帝俯视视角，看太阳、月球与地球三者的相位关系。', axing: '太阳、月球、地球和时间的相位被画在了同一张表盘上，能直接读到此刻的日月地同行状态。', q: '大家所在的城市现在是几点？' },
    { ayuan: '地球上划分了 24 个时区，每个时区相对空间里 24 个点，每 15 度弧长就是一小时。', axing: '所以这张表盘不用算时差，指到哪个数字，就是哪个时区的当地时间。', q: '你那边现在是白天还是夜晚？' },
    { ayuan: '月球绕地球运转，大约每 29 天半完成一次月相周期。', axing: '所以我们看到的上弦月、凸月、满月，都是三球真实位置变化的结果。', q: '今晚的月亮是什么形状？' },
    { ayuan: '月球和太阳的引力作用在地球上形成引潮力，这是可以客观计算的物理现象。', axing: '时间景观最早的起点，就是从日月地的相位关系里，看见了时间运转的规律。', q: '想了解月相还是潮汐？' }
  ];
  var SOLAR_TOPICS = [
    { ayuan: '现在我们以上帝俯视视角观察太阳系排布，行星在真实空间里不存在地面视角的“连线现象”。', axing: '我们在地面看到的行星连珠，只是二维投影效果，在这里能看到宇宙最真实的三维运行状态。', q: '大家想看哪颗行星？' },
    { ayuan: '演算依据 IAU 国际天文学联合会标准，以及 NASA DE440 高精度星历参数。', axing: '结合项目自有坐标系规则，把它们变成眼前这个能实时演算、任意回溯的太阳系。', q: '想回到哪个历史时刻？' },
    { ayuan: '引擎支持前后五千年的天象推演，时间轴可以任意回溯与前进。', axing: '长周期演算受轨道摄动精度约束，越靠近现在越精确。', q: '唐朝、宋朝，还是你出生的那一天？' },
    { ayuan: '接下来演示核心功能——生日天象宇宙码，可精准演算任意公历日期的太阳系真实排布。', axing: '每个人都拥有属于自己出生当天的专属宇宙景观。', q: '你的生日是哪天？' }
  ];

  var WELCOME = VIEW === 'solar'
    ? { ayuan: '欢迎来到时间景观太阳系直播间，我们正在上帝俯视视角下实时演算所有行星的真实运行轨迹。', axing: '今天带大家体验星际漫游、生日天象、历史天象溯源和天文科普，欢迎点选下方问题互动。' }
    : { ayuan: '欢迎来到时间景观，我们正以北极上空的视角，看太阳、月球与地球同行的时间规律。', axing: '今天带大家看懂时区、月相、潮汐和节气，欢迎点选下方问题互动。' };

  var TOPICS = VIEW === 'solar' ? SOLAR_TOPICS : EARTH_TOPICS;

  /* ========== 语音（服务端 MiMo TTS） ========== */
  var muted = false, started = false, talkGen = 0, topicIndex = 0;
  var currentAudio = null;
  function estTime(t) { return Math.min(6500, Math.max(1600, t.length * 200)); }
  function b64ToBlob(b64, type) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type });
  }
  function speak(text, who) {
    return new Promise(function (resolve) {
      if (muted) { setTimeout(resolve, estTime(text)); return; }
      fetch('api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, voice: who.voice })
      }).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (j) {
          if (j.error || !j.audio) throw new Error(j.error || 'no audio');
          var url = URL.createObjectURL(b64ToBlob(j.audio, 'audio/mpeg'));
          var a = new Audio(url);
          currentAudio = a;
          var done = false;
          function fin() { if (!done) { done = true; URL.revokeObjectURL(url); resolve(); } }
          a.onended = fin; a.onerror = fin;
          var guard = setTimeout(fin, estTime(text) + 6000);
          a.onended = function () { clearTimeout(guard); fin(); };
          a.onerror = function () { clearTimeout(guard); fin(); };
          var pr = a.play(); if (pr && pr.catch) pr.catch(fin);
        })
        .catch(function () { resolve(); }); // TTS 失败静默降级（仅显示文字）
    });
  }
  function stopSpeech() { if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; } }

  /* ========== 样式：右侧抽屉 + 对话流 + 问题列表 ========== */
  var W = 320;
  var CSS = [
    '#tv-assist{position:fixed;top:48px;right:0;bottom:60px;width:' + W + 'px;max-width:90vw;z-index:18;transform:translateX(110%);transition:transform .26s ease;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;display:flex}',
    '#tv-assist.on{transform:translateX(0)}',
    '#tv-assist .tv-panel{flex:1;display:flex;flex-direction:column;gap:10px;background:rgba(7,18,34,.92);backdrop-filter:blur(14px);border:1px solid rgba(95,214,240,.28);border-right:none;border-radius:16px 0 0 16px;padding:14px;box-shadow:-10px 0 36px rgba(0,0,0,.45)}',
    '#tv-assist .tv-head{display:flex;align-items:center;gap:7px;flex:none}',
    '#tv-assist .tv-live{display:flex;align-items:center;gap:5px;color:#eaf6ff;font-size:12.5px;font-weight:700}',
    '#tv-assist .tv-dot{width:7px;height:7px;border-radius:50%;background:#39e08a;box-shadow:0 0 8px #39e08a;animation:tvpulse 1.8s infinite}',
    '@keyframes tvpulse{0%,100%{opacity:1}50%{opacity:.35}}',
    '#tv-assist .tv-ai{color:#5fd6f0}',
    '#tv-assist .tv-status{font-size:11px;padding:2px 8px;border-radius:999px;color:#9fe0b8;background:rgba(90,210,140,.14)}',
    '#tv-assist .tv-status.off{color:#ffc9c9;background:rgba(255,140,140,.14)}',
    '#tv-assist .tv-sp{flex:1}',
    '#tv-assist .tv-head button{font-size:12px;color:#bfe4f5;background:rgba(95,214,240,.08);border:1px solid rgba(95,214,240,.3);border-radius:999px;padding:4px 9px;cursor:pointer;line-height:1}',
    '#tv-assist .tv-log{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:9px;padding-right:3px}',
    '#tv-assist .tv-log::-webkit-scrollbar{width:4px}',
    '#tv-assist .tv-log::-webkit-scrollbar-thumb{background:rgba(95,214,240,.25);border-radius:2px}',
    '#tv-assist .tv-line{display:flex;gap:9px;align-items:flex-start;animation:tvrise .25s ease}',
    '@keyframes tvrise{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}',
    '#tv-assist .tv-ava{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#04121c}',
    '#tv-assist .tv-line.ayuan .tv-ava{background:linear-gradient(135deg,#5fd6f0,#2aa9c8)}',
    '#tv-assist .tv-line.axing .tv-ava{background:linear-gradient(135deg,#ff9ebc,#e0608f)}',
    '#tv-assist .tv-body{flex:1;min-width:0}',
    '#tv-assist .tv-nm{font-size:11px;font-weight:700;color:#5fd6f0;margin-bottom:2px}',
    '#tv-assist .tv-line.axing .tv-nm{color:#ff9ebc}',
    '#tv-assist .tv-tx{font-size:14px;color:#eaf6ff;line-height:1.5;word-break:break-word}',
    '#tv-assist .tv-line.aud .tv-tx{color:#9fe0b8;font-size:13px;background:rgba(90,210,140,.1);border:1px solid rgba(90,210,140,.22);border-radius:9px;padding:6px 10px}',
    '#tv-assist .tv-line.hint .tv-tx{color:#7fa8c4;font-size:12px}',
    '#tv-assist .tv-next{flex:none;display:block;width:100%;padding:10px;font-size:13.5px;font-weight:700;cursor:pointer;border-radius:11px;color:#04121c;background:linear-gradient(135deg,#5fd6f0,#2aa9c8);border:none}',
    '#tv-assist .tv-qa{flex:none;display:flex;flex-direction:column;gap:6px;max-height:40vh;min-height:0}',
    '#tv-assist .tv-qa-h{font-size:11.5px;font-weight:700;color:#5fd6f0;flex:none}',
    '#tv-assist .tv-qa-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;padding-right:2px}',
    '#tv-assist .tv-qa-list::-webkit-scrollbar{width:4px}',
    '#tv-assist .tv-qa-list::-webkit-scrollbar-thumb{background:rgba(95,214,240,.25);border-radius:2px}',
    '#tv-assist .tv-qa-cat{flex:none}',
    '#tv-assist .tv-qa-cat-h{font-size:11px;color:#7fa8c4;margin:4px 0 3px;padding-left:2px}',
    '#tv-assist .tv-qa-q{display:block;width:100%;text-align:left;padding:6px 9px;font-size:12px;cursor:pointer;border-radius:8px;color:#bfe4f5;background:rgba(95,214,240,.05);border:1px solid rgba(95,214,240,.18);margin-bottom:4px;line-height:1.4}',
    '#tv-assist .tv-qa-q:hover{background:rgba(95,214,240,.14);color:#eaf6ff}',
    '#tv-assist .tv-qa-refresh{flex:none;padding:6px;font-size:12px;cursor:pointer;border-radius:8px;color:#9ab8dc;background:rgba(95,214,240,.05);border:1px solid rgba(95,214,240,.2)}',
    '#tv-assist .tv-qa-refresh:hover{color:#eaf6ff;background:rgba(95,214,240,.14)}',
    '#tv-fab{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:19;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}',
    '#tv-fab button{writing-mode:vertical-rl;letter-spacing:2px;padding:13px 8px;font-size:13px;font-weight:700;cursor:pointer;color:#04121c;background:linear-gradient(180deg,#5fd6f0,#2aa9c8);border:none;border-radius:14px 0 0 14px;box-shadow:-4px 0 16px rgba(95,214,240,.3)}',
    '#tv-fab.hide{opacity:0;pointer-events:none}'
  ].join('\n');
  var styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* ========== 界面 ========== */
  function h(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  var fab = h('<div id="tv-fab"><button id="tvFabBtn">🎙 解说</button></div>');
  document.body.appendChild(fab);
  var panel = h(
    '<div id="tv-assist"><div class="tv-panel">' +
      '<div class="tv-head">' +
        '<span class="tv-live"><span class="tv-dot"></span><span class="tv-ai">AI 虚拟解说</span></span>' +
        '<span class="tv-status off" id="tvStatus">…</span>' +
        '<span class="tv-sp"></span>' +
        '<button id="tvMute">🔊</button>' +
        '<button id="tvClose">✕</button>' +
      '</div>' +
      '<div class="tv-log" id="tvLog"></div>' +
      '<button class="tv-next" id="tvNext">▶ 下一个话题</button>' +
      '<div class="tv-qa">' +
        '<div class="tv-qa-h">📚 知识库问答 · 点选即答</div>' +
        '<div class="tv-qa-list" id="tvQaList"></div>' +
        '<button class="tv-qa-refresh" id="tvQaRefresh">🔀 换一批</button>' +
      '</div>' +
    '</div></div>'
  );
  document.body.appendChild(panel);

  var $ = function (id) { return document.getElementById(id); };
  var logEl = $('tvLog');

  /* ========== 对话流渲染 ========== */
  function clearLog() { logEl.innerHTML = ''; }
  function scrollLog() { logEl.scrollTop = logEl.scrollHeight; }
  function addLine(who, text) {
    var d = document.createElement('div');
    d.className = 'tv-line ' + who.id;
    if (who.id === 'aud') {
      var at = document.createElement('div'); at.className = 'tv-tx'; at.textContent = text;
      d.appendChild(at);
    } else {
      var ava = document.createElement('div'); ava.className = 'tv-ava'; ava.textContent = who.id === 'ayuan' ? '远' : '星';
      var body = document.createElement('div'); body.className = 'tv-body';
      var nm = document.createElement('div'); nm.className = 'tv-nm'; nm.textContent = who.name + ' · ' + who.tag;
      var tx = document.createElement('div'); tx.className = 'tv-tx'; tx.textContent = text;
      body.appendChild(nm); body.appendChild(tx);
      d.appendChild(ava); d.appendChild(body);
    }
    logEl.appendChild(d);
    scrollLog();
  }

  /* ========== 说话编排（可被打断） ========== */
  function interrupt() { talkGen++; stopSpeech(); }
  async function sayLine(who, text, gen) {
    addLine(who, text);
    await speak(text, who);
    return gen === talkGen;
  }

  async function welcome() {
    var gen = ++talkGen;
    clearLog();
    if (!(await sayLine(AYUAN, WELCOME.ayuan, gen))) return;
    if (!(await sayLine(AXING, WELCOME.axing, gen))) return;
  }
  async function nextTopic() {
    var gen = ++talkGen;
    clearLog();
    var t = TOPICS[topicIndex % TOPICS.length]; topicIndex++;
    if (!(await sayLine(AYUAN, t.ayuan, gen))) return;
    if (!(await sayLine(AXING, t.axing, gen))) return;
    if (!(await sayLine(AXING, t.q, gen))) return;
  }

  /* ========== 知识库问答：点选即答 ========== */
  var qaItems = [];
  var Q_NUM = 2;  // 每次随机显示 2 条问题
  function loadQA() {
    fetch('api/qa').then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (j) { qaItems = j.items || []; renderQA(); })
      .catch(function () { qaItems = []; renderQA(); });
  }
  function pickRandom(arr, n) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, Math.min(n, a.length));
  }
  function renderQA() {
    var el = $('tvQaList'); if (!el) return;
    el.innerHTML = '';
    if (!qaItems.length) { el.innerHTML = '<div style="font-size:12px;color:#7fa8c4;padding:4px 2px">知识库为空，请在维护页面添加。</div>'; return; }
    pickRandom(qaItems, Q_NUM).forEach(function (k) {
      var q = document.createElement('button'); q.className = 'tv-qa-q'; q.textContent = k.question;
      q.addEventListener('click', function () { answer(k); });
      el.appendChild(q);
    });
  }
  function answer(k) {
    var who = k.role === 'axing' ? AXING : AYUAN;
    interrupt();
    addLine({ id: 'aud' }, k.question);
    addLine(who, k.answer);
    speak(k.answer, who);
  }

  function start() { if (!started) { started = true; welcome(); } }

  /* ========== 事件 ========== */
  function openDrawer() { panel.classList.add('on'); fab.classList.add('hide'); start(); loadQA(); }
  function closeDrawer() { panel.classList.remove('on'); fab.classList.remove('hide'); interrupt(); }
  $('tvFabBtn').addEventListener('click', openDrawer);
  $('tvClose').addEventListener('click', closeDrawer);
  $('tvNext').addEventListener('click', function () { if (!started) { started = true; } nextTopic(); });
  $('tvMute').addEventListener('click', function () { muted = !muted; $('tvMute').textContent = muted ? '🔇' : '🔊'; if (muted) stopSpeech(); });
  $('tvQaRefresh').addEventListener('click', renderQA);

  /* ========== 状态 ========== */
  fetch('api/health').then(function (r) { return r.json(); }).then(function (j) {
    var el = $('tvStatus');
    if (j && j.tts) { el.textContent = '🔊 语音在线'; el.className = 'tv-status'; }
    else { el.textContent = '🔇 仅文字'; el.className = 'tv-status off'; }
  }).catch(function () { var el = $('tvStatus'); el.textContent = '🔇 仅文字'; el.className = 'tv-status off'; });
})();
