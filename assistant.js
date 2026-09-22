/* 时间景观 · 双角色课程。自然连续讲解，观众只在对话邀请时输入。 */
(async function () {
  'use strict';
  // 屏保只展示实时表盘，不运行隐藏的课程或自动切换日期。
  if (document.body.classList.contains('scrsv') || new URLSearchParams(location.search).get('scrsv') === '1') return;
  const view = window.TIMEVIEW === 'solar' ? 'solar' : 'earth', $ = id => document.getElementById(id);
  const roles = [{name:'阿远',voice:'male',tag:'白桦 · 原理讲解'},{name:'阿星',voice:'female',tag:'冰糖 · 观察引导'}];
  const chapters = [
    ['00:00–02:00','引导与开场','earth','先看引导视频，再找一座熟悉的城市。','大家好，我是AI解说阿远。今天从地球的时间地图出发，认识太阳系，再观察一个大家选择的历史日期。','我是AI解说阿星。我们会提出几个小问题，你可以作答，也可以提交日期。先看看眼前的地球，能找到你熟悉的城市吗？'],
    ['02:00–05:00','认识时间地图','earth','先小时，再分秒，最后确认日期和时区。','先看小时刻度，再看分钟和秒钟。读取城市时间前，要确认时区和日期。政治时区并不完全按照每十五度经度来划分。','我们一起读一读北京、伦敦和纽约的时间。先读小时，再读分秒，最后读出日期，不用一下记住所有按钮。'],
    ['05:00–12:00','读取世界时间','earth','北京 → 伦敦 → 纽约，比较同一个瞬间。','同一瞬间，各城市的当地时间可能不同，日期也可能不同。我们对照画面，依次读取北京、伦敦和纽约的时间。','我们会依次读出同一时刻的三个城市。先读北京，再读伦敦和纽约，留意它们是不是同一天。'],
    ['12:00–18:00','时间互动 · 两道题','earth','先回答时差问题，再提交日期对照。','刚才我们比较了三个城市的时间。接下来，想请你也一起观察这幅图。','不用急着回答。我们一次只看一个问题，你可以直接把想法写给我。'],
    ['18:00–24:00','春夏秋冬','earth','比较南北半球，再观察夏至与冬至附近。','地轴倾斜与地球公转使日照条件随季节变化。南北半球季节相反，不能把季节简单归因于距离太阳远近。','先比较南北半球，再看北京夏季与冬季的白昼。我们会换到两个代表日期，把时间地图停下来，慢慢观察。'],
    ['24:00–28:00','轨道与 XYZ','solar','轨道 → X → Y → Z，逐层建立空间方向。','到了太阳系，我们先看行星走过的轨道。再加上几个方向，帮助我们把这个空间看清楚。','我会一层一层展开，你跟着看就好。最后转一点角度，看看平面以外又多了什么。'],
    ['28:00–36:00','八大行星与冥王星','solar','从水星向外，逐站打开信息卡。','沿轨道从内向外观察八大行星，关注相对位置与公转周期。冥王星属于矮行星，不计入八大行星。','每到一站，先观察一个特点，再回到全景找到它的位置。画面的大小与距离经过缩放，适合帮助理解。'],
    ['36:00–41:00','星座与星宿','solar','两种图层分开看，每种先认一个例子。','星座与星宿反映不同文化组织和认识星空的方式。我们从观察与文化记录的角度讲解，不延伸到个人性格或命运。','先看一种星空图案，再换另一种。我们先辨认画面中的标注；屏幕上的示意连线不代表恒星之间真的相连。'],
    ['41:00–44:00','更远的探索','solar','旅行者号与三体主题：实物、示意、小说。','旅行者号让我们认识深空探测的尺度。三体主题需要区分真实的恒星系统知识和小说中的故事设定。','这里展示的是教学模型，预设轨迹不是实时观测。未来可以围绕探测器、邻近恒星和星际距离继续探索。'],
    ['44:00–47:00','生日天象示范','solar','演示日期：2000-01-01，12:00，北京时间。','我们查看所选日期的天象与历法信息，形成一份可核对的记录，不作个人评价或未来预测。','先看底部日期，再看图景，最后看报告。只提供日期时，明确采用北京时间十二点，不把它说成实际出生时刻。'],
    ['47:00–57:00','两位观众的日期','solar','案例 A 与 B，每个建议五分钟，逐个确认。','刚才看的是演示日期。现在我们可以换成你熟悉的一天，看看那时的月亮和行星。','我们一次只看一个日期。如果你还没想好，也没关系，我会先找个例子，陪你一起看。'],
    ['57:00–60:00','回到现在','solar','恢复当前时间，选择下次想探索的主题。','今天练习了读取城市时间，认识季节、轨道和空间方向，也观察了特定日期的天象记录。','下一次你想继续看世界时间、太阳系，还是更远的星空？你可以告诉我，作为下一堂课的参考。']
  ];
  const key = 'tv-natural-course-v1';
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(key) || '{}'); } catch (_) {}
  let cursor = Number.isInteger(saved.cursor) ? saved.cursor : 0;
  let muted = !!saved.muted, running = false, generation = 0, cancel = null;
  let closed = !!saved.closed, navigating = false, welcomed = false, lastChapter = -1, resumeAfterIntro = false;
  let currentDate = null, report = null;
  const steps = [];
  function say(ch, who, text, action) { steps.push({ch, who, text, action, type:'say'}); }
  function ask(ch, text, answer) { steps.push({ch, who:1, text, answer, type:'ask'}); }
  function date(ch, text, fallback, birthday) { steps.push({ch, who:1, text, fallback, birthday, type:'date'}); }
  function scene() { if (!window.TimeviewCourse) throw Error('画面还在准备，稍后继续。'); return window.TimeviewCourse; }
  function layer(name, on) { scene().layer(name, on); }
  function cleanSolar() { scene().focus?.('planets'); ['axes','zodiac','xiusu','threeBody','voyager'].forEach(n=>layer(n,false)); $('planetCard').style.display='none'; }
  for (let ch = 0; ch < chapters.length; ch++) {
    say(ch, 0, chapters[ch][4], () => { if(view==='solar') cleanSolar(); });
    say(ch, 1, chapters[ch][5]);
    if (ch === 2) {
      say(ch, 0, () => {
        const t = new Date(scene().time());
        return '我们读一下画面上的同一瞬间。' + [['北京','Asia/Shanghai'],['伦敦','Europe/London'],['纽约','America/New_York']].map(([n,z])=>n+'是'+new Intl.DateTimeFormat('zh-CN',{timeZone:z,month:'long',day:'numeric',hour:'numeric',minute:'numeric',hour12:false}).format(t)).join('，')+'。注意，日期也要一起读出来。';
      });
    }
    if (ch === 3) {
      ask(ch, '先看一看，北京、伦敦和纽约显示的是同一天吗？可以直接告诉我你的观察。', '同一瞬间，不同城市可能处在不同的日期。我们一起核对画面上的年月日，再比较小时和分钟。');
      date(ch, '我们换一天试试看。你想看哪个日期？输入公历年月日就可以。', '2000-01-01', false);
    }
    if (ch === 4) {
      ask(ch, '北半球是夏天的时候，南半球也一样吗？', '南北半球的季节相反。地轴倾斜，让两边获得日照的情况随公转发生变化。');
      say(ch, 1, '先停在六月二十一日，夏至附近，看看日照方向。', ()=>scene().setTime(Date.parse('2026-06-21T12:00:00+08:00')));
      say(ch, 0, '再换到十二月二十二日，冬至附近。把两个时刻放在一起想一想，日照条件已经改变了。', ()=>scene().setTime(Date.parse('2026-12-22T12:00:00+08:00')));
      ask(ch, '北京在夏至附近，通常比冬至附近白昼更长吗？', '是的。北京位于北半球，地轴倾斜使这里在夏季通常有更长的白昼。');
      say(ch, 1, '接下来，我们把视野拉远，离开地球，去看看太阳系。');
    }
    if (ch === 5) {
      ['先看轨道，每一圈帮助我们辨认一条运动路径。','现在展开X轴，先确定一个空间方向。','再加上Y轴，两条轴帮助我们读懂这个平面。','最后看Z轴。我们转一点角度，让第三个方向更容易看清。'].forEach((t,i)=>say(ch,i%2,t,()=>scene().axes(i)));
    }
    if (ch === 6) {
      const planets = [['mercury','水星','它最靠近太阳。'],['venus','金星','它有浓密的大气。'],['earth','地球','这是我们生活的星球。'],['mars','火星','它的表面呈现红色。'],['jupiter','木星','它是太阳系里最大的行星。'],['saturn','土星','它的环是很鲜明的特征。'],['uranus','天王星','它的自转轴倾斜得很明显。'],['neptune','海王星','它是八大行星中距离太阳最远的一颗。'],['pluto','冥王星','它属于矮行星。']];
      planets.forEach(([id,name,fact],i)=>say(ch,i%2,'这一站是'+name+'。'+fact+'先看看它在画面里的位置，再读一读旁边的信息。',()=>scene().planet(id)));
    }
    if (ch === 7) {
      say(ch, 1, '先看星座图层。人们把天空分区，也用熟悉的图案帮助记忆。',()=>layer('zodiac',true));
      say(ch, 0, '现在换成星宿。换一种文化中的星空组织方式，仍然是在认识同一片天空。',()=>{layer('zodiac',false);layer('xiusu',true);});
    }
    if (ch === 8) {
      say(ch,1,'先看看旅行者号的示意位置。我们借它理解深空探测的尺度，这不是探测器的实时遥测画面。',()=>layer('voyager',true));
      say(ch,0,'再看三体主题。这里的动态演示帮助理解多颗恒星的概念，不是对小说情节或真实轨道的精确复现。',()=>{layer('voyager',false);layer('threeBody',true);});
    }
    if (ch === 9) {
      steps.push({ch,type:'example',fallback:'2000-01-01',birthday:true});
    }
    if (ch === 10) {
      date(ch,'现在轮到你了。可以输入一个生日，我们一起看看那一天。只写日期也可以，统一用北京时间中午十二点作演示。','2000-01-01',true);
      date(ch,'我们再看一个日期。还有哪位观众愿意分享？','2024-06-21',true);
    }
    if (ch === 11) {
      say(ch,0,'现在让时间恢复流动，回到今天。',()=>{scene().now();report=null;$('tvReport').hidden=true;});
      ask(ch,'下一次你想继续了解世界时间、太阳系，还是更远的星空？可以留下一句话。','我们今天先到这里。以后可以沿着这些方向，继续认识时间与宇宙。');
    }
  }
  let scriptTemplates = {"date": "{{来源}}{{日期}}，{{时间说明}}底部时间和画面已经一起更新了。", "dateObservation": "同一时刻，各地用不同的当地时间表达。请再看一眼北京、伦敦与纽约，日期有没有变化？", "report": "这一天，模型计算的月相是{{月相}}，照亮比例约百分之{{照亮比例}}。报告已经放在对话下面，你可以慢慢看，也可以留下这份记录。", "reportFailure": "这次报告没有准备好，我们先观察画面，不猜测具体结果。", "received": "收到你的想法，我们一起看看。", "noAnswer": "没关系，我们一起看。"};

  function fillTemplate(text, values) {
    return text.replace(/\{\{([^{}]+)\}\}/g, (_,name) => String(values[name] ?? ''));
  }
  // 每次打开页面获取已发布版本；当前页使用同一份快照，讲解中不替换台词。
  try {
    const response = await fetch('api/course-script', {cache:'no-store', signal:AbortSignal.timeout(5000)});
    if (!response.ok) throw Error('script unavailable');
    const script = await response.json();
    if (script.lines?.length !== steps.length || script.chapters?.length !== chapters.length) throw Error('script mismatch');
    script.chapters.forEach((c,i)=>{chapters[i][1]=c.title;});
    script.lines.forEach((line,i)=>{
      const step=steps[i];
      if(line.id!=='step-'+i || step.type!==line.type)throw Error('step mismatch');
      if(typeof step.text==='function') {
        step.text=()=>fillTemplate(line.text, {'城市时间':[['北京','Asia/Shanghai'],['伦敦','Europe/London'],['纽约','America/New_York']].map(([n,z])=>n+'是'+new Intl.DateTimeFormat('zh-CN',{timeZone:z,month:'long',day:'numeric',hour:'numeric',minute:'numeric',hour12:false}).format(new Date(scene().time()))).join('，')});
      } else if(step.text) step.text=line.text;
      step.who=line.role==='axing'?1:0;
      if(step.answer)step.answer=line.answer;
      if(step.fallback)step.fallback=line.fallback;
    });
    scriptTemplates={...scriptTemplates,...script.templates};
  } catch (_) { /* 后台暂时不可达时，保留内置的完整讲解。 */ }
  if(cursor<0 || cursor>=steps.length || chapters[steps[cursor].ch][2]!==view) cursor=steps.findIndex(s=>chapters[s.ch][2]===view);
  // 日期不写入会话存储；刷新到报告步骤时重新邀请输入。
  function persist(resume=running) { try { sessionStorage.setItem(key,JSON.stringify({cursor,muted,closed,resume})); } catch (_) {} }
  const style=document.createElement('style');
  style.textContent=`
  #tv-assist{position:fixed;right:18px;top:68px;bottom:76px;width:330px;max-width:calc(100vw - 28px);z-index:22;display:none;flex-direction:column;color:#eaf0ed;background:linear-gradient(160deg,#112129ed,#0a171fef);border:1px solid #c7d7d523;border-radius:18px;box-shadow:0 16px 60px #0005;font:14px/1.85 'Microsoft YaHei','PingFang SC',sans-serif;overflow:hidden;backdrop-filter:blur(18px)}
  #tv-assist.on{display:flex}#tv-assist *{box-sizing:border-box}#tv-assist [hidden]{display:none!important}#tv-assist header{padding:18px 20px 13px;border-bottom:1px solid #ffffff10}#tv-assist .top{display:flex;justify-content:space-between;align-items:center;gap:10px}#tv-assist .kicker{color:#c6b58a;letter-spacing:2px;font-size:10px}#tv-assist h2{font:22px/1.5 'STSong','SimSun',serif;margin:5px 0;color:#f1eee3}#tv-assist .sub{font-size:11px;color:#95aaaF}#tv-assist button{font:inherit;color:#afc3c6;background:none;border:none;cursor:pointer;padding:6px 9px;border-radius:6px}#tv-assist button:hover{color:#f2dbab;background:#ffffff09}#tv-assist button:focus-visible,#tv-assist input:focus-visible{outline:2px solid #d9bf87;outline-offset:2px}#tv-assist .body{flex:1;min-height:0;overflow:auto;padding:6px 20px 20px;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#ffffff20 transparent}#tv-assist .line{padding:14px 0;border-bottom:1px solid #ffffff09;animation:tvArrive .45s ease}#tv-assist .speaker{font-size:11px;color:#8dc4c4;display:flex;gap:7px;align-items:center}#tv-assist .female .speaker{color:#dcc18c}#tv-assist .line p{margin:5px 0 0;line-height:1.95}#tv-assist .audience{font-size:12px;color:#a0b0b5;text-align:right;padding:12px 0}#tv-assist footer{border-top:1px solid #ffffff10;padding:12px 18px}#tv-assist .controls{display:flex;align-items:center;justify-content:space-between;font-size:12px}#tvStatus{color:#a3b6b9;font-size:11px}#tv-assist form{display:flex;gap:8px;margin-top:10px}#tv-assist input{flex:1;min-width:0;background:#ffffff07;color:#edf1ec;border:1px solid #ffffff25;padding:10px;border-radius:9px;font:13px 'Microsoft YaHei',sans-serif}#tv-assist form button{color:#ead3a2;flex:none}#tvPrompt{font-size:11px;color:#cab991;margin-top:6px}#tvReport{font-size:12px;padding:12px;margin-top:14px;border:1px solid #dac49130;border-radius:10px;background:#e5c68105;white-space:pre-line;color:#cdd7d4}#tvReport a{color:#e2c991;text-decoration:none;display:block;margin-top:8px}#tv-fab{position:fixed;right:16px;top:50%;z-index:21;border:1px solid #d9c18d44;border-radius:20px;padding:12px 14px;background:#12232d;color:#e1c895;cursor:pointer;font:13px 'Microsoft YaHei',sans-serif}#tv-fab.hide{display:none}@keyframes tvArrive{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){#tv-assist .line{animation:none}}@media(max-width:600px){#tv-assist{right:10px;top:auto;bottom:76px;width:calc(100vw - 20px);height:45vh}#tv-assist h2{font-size:20px}#tv-assist header{padding:12px 16px}#tv-assist .body{padding:4px 16px 16px}}`;
  style.textContent += `#tv-assist .course-card{position:relative!important;left:auto!important;top:auto!important;width:auto;max-height:24vh;overflow:auto;margin:8px 14px;flex-shrink:0}#tv-assist .stage-nav{padding:4px 18px 8px;flex-shrink:0;border-bottom:1px solid #ffffff10}#tv-assist .stage-nav input{width:100%;padding:0;accent-color:#dcc18c}#tvStageLabel{display:block;font-size:11px;color:#b6c7c8}#tv-assist header,#tv-assist footer{flex-shrink:0}#tv-assist input[type=date]{color-scheme:dark}@media(max-width:600px){#tv-assist header{padding:5px 12px}#tv-assist h2{font-size:16px;margin:0}#tv-assist .sub{display:none}#tv-assist .course-card{max-height:15vh}#tv-assist footer{padding:5px 12px}}`;
  style.textContent += `#tv-assist .reading-chunk{color:#fff2cc;background:#b88a3645;border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;box-shadow:0 0 0 2px #b88a3615}`;
  style.textContent += `#tv-assist .stage-nav{position:relative;padding:8px 18px 12px}#tvStageLabel{color:#b9c8ca;font-size:11px;letter-spacing:.3px}#tv-assist .cue-track{position:relative;display:flex;justify-content:space-between;margin-top:5px;height:28px;isolation:isolate}#tv-assist .cue-track:before{content:'';position:absolute;top:13px;left:12px;right:12px;height:1px;background:linear-gradient(to right,#d8bd84 var(--progress,0%),#49616b var(--progress,0%));z-index:-1}#tv-assist .cue-point{position:relative;width:24px;min-width:0;height:28px;padding:0;border-radius:5px;background:transparent;display:grid;place-items:center}#tv-assist .cue-point:before{content:'';width:5px;height:5px;border:1px solid #81959c;background:#112129;border-radius:50%}#tv-assist .cue-point.past:before{background:#b8a273;border-color:#b8a273}#tv-assist .cue-point[aria-current=step]:before{width:8px;height:8px;background:#efd19a;border-color:#efd19a;box-shadow:0 0 0 4px #d7bd8520}#tv-assist .cue-point:hover:before,#tv-assist .cue-point:focus-visible:before{background:#fff0c7;border-color:#fff0c7}#tv-assist .cue-tooltip{position:absolute;bottom:49px;left:12px;right:12px;padding:7px 10px;background:#20343e;color:#f7e2b7;border:1px solid #c9b48250;border-radius:7px;font-size:12px;box-shadow:0 6px 18px #0004;pointer-events:none;z-index:2}`;
  document.head.append(style);
  const panel=document.createElement('aside');panel.id='tv-assist';panel.setAttribute('aria-label','阿远与阿星的讲解');
  panel.innerHTML=`<header><div class="top"><span class="kicker">时间景观 · AI 双人讲解</span><button id="tvClose" aria-label="收起并暂停讲解">×</button></div><h2 id="tvTitle">一起读懂眼前的宇宙</h2><span class="sub">阿远 · 白桦　 /　 阿星 · 冰糖</span></header><nav class="stage-nav" aria-label="课程环节"><label id="tvStageLabel" for="tvStage"></label><div id="tvCues" class="cue-track" role="group" aria-label="选择讲解环节"></div><div id="tvCueTip" class="cue-tooltip" role="tooltip" hidden></div><input id="tvStage" type="hidden" value="0"></nav><div class="body" id="tvBody"><div id="tvLog" role="log" aria-live="polite"></div><div id="tvReport" hidden></div></div><footer><div class="controls"><span id="tvStatus" role="status">等你一起出发</span><div><button id="tvPlay">开始听</button><button id="tvMute" aria-label="切换声音">声音开</button></div></div><form id="tvReplyForm" hidden><input id="tvReply" aria-label="回复阿星" autocomplete="off" maxlength="120"><button type="submit" aria-label="发送回复">发送</button></form><div id="tvPrompt" hidden></div></footer>`;
  document.body.append(panel);
  const fab=document.createElement('button');fab.id='tv-fab';fab.textContent='听阿远与阿星讲解';document.body.append(fab);
  ['mousedown','touchstart','touchmove','wheel','click'].forEach(t=>panel.addEventListener(t,e=>e.stopPropagation(),{passive:true}));
  function status(t){$('tvStatus').textContent=t;}
  function append(who,text){
    const el=document.createElement('div');el.className=who===2?'audience':'line '+(who===1?'female':'');
    if(who<2){const name=document.createElement('div');name.className='speaker';name.textContent=(who?'● 阿星':'● 阿远');el.append(name);}
    const p=document.createElement('p');p.textContent=text;el.append(p);$('tvLog').append(el);
    while($('tvLog').children.length>6)$('tvLog').firstChild.remove();
    $('tvBody').scrollTop=$('tvBody').scrollHeight;
    return p;
  }
  function valid(gen){return running&&generation===gen;}
  function pause(message='已暂停，准备好就继续'){
    running=false;generation++;if(cancel)cancel();cancel=null;cancelAudioRequests();
    $('tvReplyForm').hidden=true;$('tvPrompt').hidden=true;$('tvPlay').textContent='继续听';
    status(message);persist(false);
  }
  function delay(ms,gen){return new Promise(resolve=>{
    if(!valid(gen))return resolve();
    let done=false;const end=()=>{if(done)return;done=true;clearTimeout(timer);if(cancel===end)cancel=null;resolve();};
    const timer=setTimeout(end,ms);cancel=end;
  });}
  const audioCache=new Map(), audioRequests=new Set();
  function cancelAudioRequests(){for(const controller of audioRequests)controller.abort();audioRequests.clear();audioCache.clear();}
  // Each short utterance is both an audio segment and an exact highlight span.
  function speechChunks(text){
    const chars=Array.from(text),chunks=[];
    while(chars.length){
      let end=Math.min(80,chars.length);
      const sample=chars.slice(0,end).join('');
      const sentence=sample.match(/[。！？!?；;\n][”’」』]?/u);
      if(sentence)end=Array.from(sample.slice(0,sentence.index+sentence[0].length)).length;
      else if(end<chars.length){const stops=[...sample.matchAll(/[，,：:]/gu)];const stop=stops.filter(m=>m.index>=20).pop();if(stop)end=Array.from(sample.slice(0,stop.index+1)).length;}
      chunks.push(chars.splice(0,end).join(''));
    }
    return chunks;
  }
  function getAudio(text,who){
    const k=who+':'+text;
    if(!audioCache.has(k)){
      const controller=new AbortController();audioRequests.add(controller);
      const timer=setTimeout(()=>controller.abort(),25000);
      const p=fetch('api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,voice:roles[who].voice}),signal:controller.signal})
        .then(r=>{if(!r.ok)throw Error();return r.json();}).then(j=>{if(!j.audio)throw Error();return j.audio;})
        .catch(()=>{if(audioCache.get(k)===p)audioCache.delete(k);return null;})
        .finally(()=>{clearTimeout(timer);audioRequests.delete(controller);});
      audioCache.set(k,p);if(audioCache.size>4)audioCache.delete(audioCache.keys().next().value);
    }
    return audioCache.get(k);
  }
  function markSpeech(paragraph,chunks){
    paragraph.replaceChildren();
    return chunks.map(text=>{const span=document.createElement('span');span.className='speech-chunk';span.textContent=text;paragraph.append(span);return span;});
  }
  function followSpeech(target){
    const body=$('tvBody'),box=body.getBoundingClientRect(),rect=target.getBoundingClientRect();
    if(rect.top<box.top+8||rect.bottom>box.bottom-8)body.scrollTop+=rect.top-box.top-body.clientHeight*.35;
  }
  async function speak(text,who,gen){
    if(!valid(gen))return;
    const paragraph=append(who,text);
    if(muted){status((who?'阿星':'阿远')+'正在讲');await delay(Math.max(3200,text.length*190),gen);return;}
    const chunks=speechChunks(text);
    const marks=markSpeech(paragraph,chunks);
    for(let i=0;i<chunks.length&&valid(gen);i++){
      status('正在准备'+(who?'阿星':'阿远')+'的语音…');
      // Request the current segment first, with at most one segment of lookahead.
      const pending=getAudio(chunks[i],who);
      if(i+1<chunks.length)getAudio(chunks[i+1],who);
      else {const next=steps[cursor+1];if(next&&next.type==='say'&&typeof next.text==='string')getAudio(speechChunks(next.text)[0],next.who);}
      const b64=await new Promise(resolve=>{
        let done=false;const end=value=>{if(done)return;done=true;if(cancel===abort)cancel=null;resolve(value);};
        const abort=()=>end(null);cancel=abort;pending.then(end);
      });
      if(!valid(gen))return;
      if(!b64){status('这一小段语音暂不可用，先一起读文字');await delay(Math.max(3500,chunks[i].length*190),gen);continue;}
      status((who?'阿星':'阿远')+'正在讲'+(chunks.length>1?' · '+(i+1)+'/'+chunks.length:''));
      await new Promise(resolve=>{
        let url,audio,timer,done=false;
        const mark=marks[i];
        const end=()=>{if(done)return;done=true;clearTimeout(timer);mark.classList.remove('reading-chunk');if(audio)audio.pause();if(url)URL.revokeObjectURL(url);if(cancel===end)cancel=null;resolve();};cancel=end;
        try{
          url=URL.createObjectURL(new Blob([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],{type:'audio/mpeg'}));audio=new Audio(url);
          timer=setTimeout(()=>{pause('声音播放中断，点继续重听这句话');},90000);
          audio.onended=end;audio.onerror=()=>pause('声音播放中断，点继续重听这句话');
          audio.play().then(()=>{if(done||!valid(gen))return;mark.classList.add('reading-chunk');followSpeech(mark);}).catch(()=>{if(valid(gen))pause('点一下继续听，即可开启声音');else end();});
        }catch(_){pause('声音未能播放，点继续重试');}
      });
    }
  }
  async function waitReply(step,gen){
    if(!valid(gen))return null;
    $('tvReplyForm').hidden=false;$('tvPrompt').hidden=false;$('tvReply').value='';$('tvReply').type=step.type==='date'?'date':'text';$('tvReply').min='1900-01-01';$('tvReply').max='2100-12-31';
    $('tvReply').placeholder=step.type==='date'?'例如：1995-08-12':'写下你的想法…';
    $('tvPrompt').textContent=step.type==='date'?'公历日期；默认北京时间 12:00，仅作演示':'可以回复，也可以先听我们接着讲';
    status('等你说一句');
    return new Promise(resolve=>{
      let timer,done=false;
      const end=value=>{if(done)return;done=true;clearTimeout(timer);$('tvReplyForm').onsubmit=null;$('tvReply').oninput=null;$('tvReply').onfocus=null;$('tvReplyForm').hidden=true;$('tvPrompt').hidden=true;if(cancel===abort)cancel=null;resolve(value);};
      const abort=()=>end(null);cancel=abort;
      const arm=ms=>{clearTimeout(timer);timer=setTimeout(()=>end(null),ms);};arm(step.type==='date'?60000:8000);
      // 开始输入后给足时间，不在观众打字时切走。
      $('tvReply').onfocus=()=>arm(60000);$('tvReply').oninput=()=>arm(60000);
      $('tvReplyForm').onsubmit=e=>{e.preventDefault();const value=$('tvReply').value.trim();if(!value)return;
        if(step.type==='date'&&!parseDate(value)){$('tvPrompt').textContent='请写有效的公历日期，如 1995-08-12（1900–2100年）';arm(60000);return;}
        end(value);
      };
    });
  }
  function parseDate(input){
    const m=input.trim().match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:\s+(\d{1,2}):(\d{2}))?$/);
    if(!m)return null;
    const date=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    const time=m[4]?m[4].padStart(2,'0')+':'+m[5]:'12:00';
    const ts=Date.parse(date+'T'+time+':00+08:00');
    if(date<'1900-01-01'||date>'2100-12-31'||!Number.isFinite(ts)||new Date(ts+480*60000).toISOString().slice(0,10)!==date)return null;
    return {date,time,ts,defaultTime:!m[4]};
  }
  async function showDate(item,birthday,gen){
    currentDate=item;report=null;$('tvReport').hidden=true;
    scene().setTime(item.ts);
    if(view==='solar'){cleanSolar();layer('orbits',true);layer('labels',true);}
    await speak(fillTemplate(scriptTemplates.date,{'来源':item.example?'我们用一个演示日期，':'你提供的是','日期':item.date,'时间说明':item.defaultTime?'以北京时间中午十二点作演示，不代表实际出生时刻。':'采用北京时间'+item.time+'。'}),1,gen);
    if(!valid(gen))return;
    if(!birthday){await speak(scriptTemplates.dateObservation,0,gen);return;}
    status('正在准备这一天的天象记录');
    const response=await fetch('api/course-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ts:item.ts}),signal:AbortSignal.timeout(15000)}).catch(()=>null);
    if(!valid(gen))return;
    if(!response||!response.ok){await speak(scriptTemplates.reportFailure,0,gen);return;}
    const data=await response.json();if(!valid(gen))return;
    report={...item,data};
    const text=['生日当天的天文快照',(item.example?'演示日期 · ':'观众日期 · ')+item.date+' '+item.time+' 北京时间',item.defaultTime?'12:00为演示时刻，非实际出生时刻。':'采用填写的时刻。','月相：'+data.moonPhase+'　照亮约 '+data.moonIllum+'%','月龄约 '+data.moonAge+' 天',data.lunar,'节气区间：'+data.solarTerm,'来源：项目 astro.js / lunar.js 近似计算。画面为教学示意，不用于精密星历或当地可见性判断。不含性格、运势或未来预测。'].join('\n');
    $('tvReport').textContent=text+'\n这份报告记录选定时刻的快照；画面时间继续运行。';$('tvReport').hidden=false;
    const download=document.createElement('a');download.href='#';download.textContent='留存这份天象记录 ↓';
    download.onclick=e=>{e.preventDefault();const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='天文快照-'+item.date+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};$('tvReport').append(download);
    await speak(fillTemplate(scriptTemplates.report,{'月相':data.moonPhase,'照亮比例':data.moonIllum}),0,gen);
    await delay(6000,gen);
  }
  async function run(){
    if(running)return;
    running=true;closed=false;welcomed=true;const gen=++generation;
    $('tvPlay').textContent='暂停';persist(true);
    try{
      while(valid(gen)&&cursor<steps.length){
        const s=steps[cursor], target=chapters[s.ch][2];
        if(target!==view){navigating=true;persist(true);location.href=(target==='earth'?'app':'solar-system.html')+'?t='+Math.round(scene().time());return;}
        if(!window.TimeviewCourse){status('等画面准备好');await delay(500,gen);continue;}
        if(window.introActive||($('introOverlay')&&$('introOverlay').offsetHeight)) {status('先一起看开场');await delay(500,gen);continue;}
        if(lastChapter!==s.ch){lastChapter=s.ch;$('tvTitle').textContent=chapters[s.ch][1].replace(' · 两道题','');updateStage(s.ch);}
        if(s.action)s.action();
        if(s.type==='say'){await speak(typeof s.text==='function'?s.text():s.text,s.who,gen);}
        else if(s.type==='ask'){
          await speak(s.text,s.who,gen);const reply=await waitReply(s,gen);if(!valid(gen))return;
          if(reply)append(2,reply);
          await speak((reply?scriptTemplates.received:scriptTemplates.noAnswer)+s.answer,0,gen);
        }else if(s.type==='date'||s.type==='example'){
          let reply=null;
          if(s.type==='date'){await speak(s.text,s.who,gen);reply=await waitReply(s,gen);}
          if(!valid(gen))return;
          if(reply)append(2,reply);
          const item={...parseDate(reply||s.fallback),example:!reply};
          await showDate(item,s.birthday,gen);
        }
        if(!valid(gen))return;
        cursor++;persist(true);await delay(1800,gen);
      }
      if(valid(gen)) {running=false;status('今天先聊到这里');$('tvPlay').textContent='再听一遍';persist(false);}
    }catch(_){if(valid(gen))pause('这一段没准备好，点继续再试一次');}
  }
  function open(start=true){closed=false;panel.classList.add('on');fab.classList.add('hide');persist(start);if(start)run();}
  function updateStage(ch){$('tvStage').value=ch;$('tvStageLabel').textContent=(ch+1)+' / '+chapters.length+' · '+chapters[ch][1];$('tvCues').style.setProperty('--progress',(ch/(chapters.length-1)*100)+'%');$('tvCues').querySelectorAll('button').forEach((b,i)=>{b.classList.toggle('past',i<ch);if(i===ch)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});}
  chapters.forEach((chapter,ch)=>{
    const point=document.createElement('button');point.type='button';point.className='cue-point';point.setAttribute('aria-label',(ch+1)+' · '+chapter[1]);point.title=chapter[1];
    const preview=()=>{$('tvCueTip').textContent=String(ch+1).padStart(2,'0')+' · '+chapter[1];$('tvCueTip').hidden=false;};
    const hide=()=>{$('tvCueTip').hidden=true;};point.onmouseenter=point.onfocus=preview;point.onmouseleave=point.onblur=hide;
    point.onclick=()=>{hide();$('tvStage').value=ch;$('tvStage').dispatchEvent(new Event('change'));};
    point.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const target=e.key==='Home'?0:e.key==='End'?chapters.length-1:Math.max(0,Math.min(chapters.length-1,ch+(e.key==='ArrowRight'?1:-1)));$('tvCues').children[target].focus();}};
    $('tvCues').append(point);
  });
  updateStage(steps[cursor].ch);
  $('tvStage').oninput=()=>{$('tvStageLabel').textContent=(+$('tvStage').value+1)+' / '+chapters.length+' · '+chapters[+$('tvStage').value][1];};
  $('tvStage').onchange=()=>{pause();resumeAfterIntro=false;const ch=+$('tvStage').value;cursor=steps.findIndex(s=>s.ch===ch);lastChapter=-1;report=null;$('tvReport').hidden=true;$('tvLog').replaceChildren();updateStage(ch);persist(true);run();};
  fab.onclick=()=>open();
  $('tvClose').onclick=()=>{closed=true;resumeAfterIntro=false;pause();panel.classList.remove('on');fab.classList.remove('hide');persist(false);fab.focus();};
  $('tvPlay').onclick=()=>{resumeAfterIntro=false;if(running)pause();else{if(cursor>=steps.length){cursor=0;if(view==='solar'){navigating=true;persist(true);location.href='app';return;}}run();}};
  $('tvMute').onclick=()=>{muted=!muted;$('tvMute').textContent=muted?'声音关':'声音开';const resume=running;pause();if(resume)run();else persist(false);};
  $('tvMute').textContent=muted?'声音关':'声音开';
  panel.addEventListener('keydown',e=>{if(e.key==='Escape')$('tvClose').click();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!navigating)pause('先暂停，回来后继续听');});
  document.addEventListener('play',e=>{if(e.target.id==='introVid'&&running){resumeAfterIntro=true;pause('先看开场，看完我们接着聊');}},true);
  window.addEventListener('timeview:course-restart',()=>{navigating=true;running=false;generation++;if(cancel)cancel();cancel=null;cancelAudioRequests();});
  window.addEventListener('pagehide',()=>{if(!navigating&&!window.courseRestarting)persist(running);running=false;generation++;if(cancel)cancel();cancelAudioRequests();});
  // 开场结束或跳过后自然接入；不覆盖观众主动收起/暂停的选择。
  setInterval(()=>{
    const intro=window.introActive||($('introOverlay')&&$('introOverlay').offsetHeight);
    if(resumeAfterIntro&&!intro&&!closed&&!document.hidden){resumeAfterIntro=false;run();}
    if(!welcomed&&!closed&&!intro&&window.TimeviewCourse){welcomed=true;open(saved.resume!==false);}
  },500);
  if(!closed){panel.classList.add('on');fab.classList.add('hide');}
})();
