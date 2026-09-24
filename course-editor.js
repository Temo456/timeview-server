/* Course authoring. The Q&A editor in admin.html remains independent. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const message=value=>$('courseMessage').textContent=value;
  let content=null,courseId=new URLSearchParams(location.search).get('course')||'',dirty=false,saving=false;
  let activeCourseId='cosmos-basics',publishingRevision=0;
  const scenes=[
    ['','不切换画面'],['now','回到今天'],
    ...[0,1,2,3].map(n=>['axes:'+n,'坐标轴 '+(n===0?'轨道':n===1?'X':n===2?'XY':'XYZ')]),
    ...['新月','峨眉月','上弦月','盈凸月','满月','亏凸月','下弦月','残月'].map((name,i)=>['moon:'+i,'月相 · '+name]),
    ['moon:cycle','月相 · 朔望月'],
    ...[['spring','春分'],['summer','夏至'],['autumn','秋分'],['winter','冬至'],['terms','二十四节气']].map(([id,name])=>['season:'+id,'季节 · '+name]),
    ...[['mercury','水星'],['venus','金星'],['earth','地球'],['mars','火星'],['jupiter','木星'],['saturn','土星'],['uranus','天王星'],['neptune','海王星'],['pluto','冥王星']].map(([id,name])=>['planet:'+id,'聚焦 · '+name]),
    ['layer:zodiac','黄道星座'],['layer:xiusu','二十八星宿'],['layer:voyager','旅行者号'],['layer:threeBody','三体示意'],['report:topdown','生日俯视图']
  ];
  function changed(){dirty=true;message('有未发布的修改');}
  function button(parent,label,action,kind='ghost'){
    const el=document.createElement('button');el.type='button';el.className='btn sm '+kind;el.textContent=label;el.onclick=action;parent.append(el);return el;
  }
  function field(parent,label,value,setter,kind='textarea',max=1000){
    const wrap=document.createElement('div'),caption=document.createElement('label'),el=document.createElement(['date','number'].includes(kind)?'input':kind);
    caption.className='course-label';caption.textContent=label;
    el.value=value??'';el.setAttribute('aria-label',label);
    if(kind==='date'){el.type='date';el.min='1900-01-01';el.max='2100-12-31';}
    else if(kind==='number'){el.type='number';el.min=1;el.max=600;el.step=1;}
    else el.maxLength=max;
    el.oninput=()=>{setter(el.value);changed();};caption.append(el);wrap.append(caption);parent.append(wrap);return el;
  }
  function select(parent,label,value,choices,setter,css=''){
    const caption=document.createElement('label');caption.className='course-label';caption.textContent=label+' ';
    const el=document.createElement('select');el.className=css;el.setAttribute('aria-label',label);
    for(const [id,name] of choices)el.add(new Option(name,id));
    el.value=String(value??'');el.onchange=()=>{setter(el.value);changed();};caption.append(el);parent.append(caption);return el;
  }
  function id(prefix){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);}
  function orderedLines(){
    const groups=new Map(content.chapters.map(ch=>[ch.id,content.lines.filter(line=>line.chapter===ch.id)]));
    content.lines=content.chapters.flatMap(ch=>groups.get(ch.id));
  }
  function rerender(){orderedLines();changed();render();}
  function moveChapter(index,direction){
    const other=index+direction;if(other<0||other>=content.chapters.length)return;
    [content.chapters[index],content.chapters[other]]=[content.chapters[other],content.chapters[index]];rerender();
  }
  function moveLine(line,direction){
    const rows=content.lines.filter(row=>row.chapter===line.chapter),index=rows.indexOf(line),other=rows[index+direction];
    if(!other)return;
    const a=content.lines.indexOf(line),b=content.lines.indexOf(other);
    [content.lines[a],content.lines[b]]=[content.lines[b],content.lines[a]];rerender();
  }
  function newLine(chapter){return {id:id('line'),chapter,type:'say',role:'ayuan',text:'请在此填写讲解内容。',answer:'',fallback:'',scene:''};}
  function renderLine(parent,line,index){
    const block=document.createElement('section');block.className='course-line';parent.append(block);
    const note=document.createElement('p');note.className='course-note';note.textContent='第 '+(index+1)+' 段 · '+line.id;block.append(note);
    const controls=document.createElement('div');controls.className='line-ops';block.append(controls);
    button(controls,'上移',()=>moveLine(line,-1));button(controls,'下移',()=>moveLine(line,1));
    button(controls,'复制',()=>{const copy=structuredClone(line);copy.id=id('line');content.lines.splice(content.lines.indexOf(line)+1,0,copy);rerender();});
    button(controls,'删除',()=>{if(content.lines.filter(row=>row.chapter===line.chapter).length<=1){message('每章至少保留一段');return;}content.lines.splice(content.lines.indexOf(line),1);rerender();},'danger');
    select(block,'段落类型',line.type,[['say','讲解'],['ask','选择题'],['date','选择日期'],['example','生日示范']],value=>{
      line.type=value;
      if(value==='ask'){line.answer=line.answer||'我们一起看。';line.choices=line.choices?.length>=2?line.choices:['选项一','选项二'];}
      if(value==='date'||value==='example'){
        line.fallback=line.fallback||'2000-01-01';
        if(line.birthday===undefined)line.birthday=true;
      }
      if(value==='example')line.text='';else line.text=line.text||'请在此填写讲解内容。';
      render();
    });
    select(block,'讲解角色',line.role,[['ayuan','阿远 · 白桦'],['axing','阿星 · 冰糖']],value=>line.role=value);
    select(block,'画面动作',line.scene||'',scenes,value=>line.scene=value,'scene-select');
    if(line.type!=='example')field(block,'台词（最多1000字）',line.text,value=>line.text=value);
    if(line.type==='ask'){
      field(block,'回答后的讲解',line.answer,value=>line.answer=value);
      field(block,'回复选项（每行一个，2至6项）',(line.choices||[]).join('\n'),value=>line.choices=value.split('\n').map(x=>x.trim()).filter(Boolean));
    }
    if(line.type==='date'||line.type==='example'){
      field(block,'无人选择时的演示日期',line.fallback,value=>line.fallback=value,'date');
      select(block,'生成天文报告',String(line.birthday!==false),[['true','是'],['false','否']],value=>line.birthday=value==='true');
    }
  }
  function render(){
    if(!content)return;
    const root=$('courseFields');root.replaceChildren();
    const title=document.createElement('section');title.className='course-section';root.append(title);
    field(title,'课程名称',content.name,value=>content.name=value,'input',60);
    const link=document.createElement('a');link.className='course-link';link.href='app?preview=1&course='+encodeURIComponent(courseId);link.textContent='预览已保存的课程 ↗';link.target='_blank';title.append(link);
    const timing=document.createElement('details');timing.className='course-section';timing.open=false;
    const heading=document.createElement('summary');heading.textContent='互动等待时间';timing.append(heading);
    const timingBody=document.createElement('div');timingBody.className='f';timing.append(timingBody);
    for(const [key,label] of [['replySeconds','选择答案等待（秒）'],['dateReplySeconds','选择日期等待（秒）'],['editingSeconds','调整日期后等待（秒）']])field(timingBody,label,content.settings[key],value=>content.settings[key]=Number(value),'number');
    root.append(timing);
    content.chapters.forEach((chapter,index)=>{
      const details=document.createElement('details');details.className='course-section';details.open=index===0;root.append(details);
      const summary=document.createElement('summary');summary.textContent=String(index+1).padStart(2,'0')+' · '+chapter.title+' · '+(chapter.view==='earth'?'地球':'太阳系');details.append(summary);
      const body=document.createElement('div');body.className='f';details.append(body);
      const ops=document.createElement('div');ops.className='course-ops';body.append(ops);
      button(ops,'章节上移',()=>moveChapter(index,-1));button(ops,'章节下移',()=>moveChapter(index,1));
      button(ops,'删除章节',()=>{if(content.chapters.length<=1){message('至少保留一章');return;}if(!confirm('删除本章及其全部段落？'))return;content.chapters.splice(index,1);content.lines=content.lines.filter(line=>line.chapter!==chapter.id);rerender();},'danger');
      field(body,'章节名称',chapter.title,value=>{chapter.title=value;summary.textContent=String(index+1).padStart(2,'0')+' · '+value;},'input',40);
      select(body,'讲解画面',chapter.view,[['earth','地球视图'],['solar','太阳系视图']],value=>{chapter.view=value;summary.textContent=String(index+1).padStart(2,'0')+' · '+chapter.title+' · '+(value==='earth'?'地球':'太阳系');});
      content.lines.filter(line=>line.chapter===chapter.id).forEach((line,i)=>renderLine(body,line,i));
      button(body,'＋ 本章增加一段',()=>{const rows=content.lines.filter(line=>line.chapter===chapter.id),last=rows.at(-1);content.lines.splice(content.lines.indexOf(last)+1,0,newLine(chapter.id));rerender();});
    });
    button(root,'＋ 增加章节',()=>{
      const chapterId=Math.max(-1,...content.chapters.map(ch=>ch.id))+1;
      content.chapters.push({id:chapterId,title:'新章节',view:content.chapters.at(-1).view});
      content.lines.push(newLine(chapterId));rerender();
    });
    const extra=document.createElement('details');extra.className='course-section';root.append(extra);
    const extraTitle=document.createElement('summary');extraTitle.textContent='互动与报告衔接语';extra.append(extraTitle);
    const body=document.createElement('div');body.className='f';extra.append(body);
    const names={date:'复述日期（阿星）',dateObservation:'日期更新后的观察（阿远）',report:'报告讲解（阿远）',reportFailure:'报告失败时（阿远）',received:'收到回答时（阿远）',noAnswer:'没有回答时（阿远）'};
    for(const name of Object.keys(names))field(body,names[name],content.templates[name],value=>content.templates[name]=value);
    const tip=document.createElement('p');tip.className='course-note';tip.textContent='日期支持 {{来源}}、{{日期}}、{{时间说明}}；报告支持 {{月相}}、{{照亮比例}}。';body.append(tip);
  }
  async function loadCatalog(){
    const response=await fetch('api/courses',{cache:'no-store'});if(!response.ok)throw Error('课程列表加载失败');
    const data=await response.json(),select=$('courseSelect');select.replaceChildren();
    activeCourseId=data.activeCourseId;publishingRevision=data.revision;
    const active=data.courses.find(course=>course.id===activeCourseId);
    $('coursePublished').textContent='前台当前课程：'+(active?.name||'未设置');
    for(const course of data.courses)select.add(new Option(course.name+(course.id===activeCourseId?' · 前台当前课程':'')+' · v'+course.revision,course.id));
    if(!data.courses.some(course=>course.id===courseId))courseId=data.activeCourseId||data.courses[0]?.id||'cosmos-basics';
    select.value=courseId;
  }
  async function loadCourse(id=courseId){
    if(saving)return;
    if(dirty&&!confirm('切换或重新加载会放弃本页未发布的修改，是否继续？')){$('courseSelect').value=courseId;return;}
    $('courseSave').disabled=true;message('正在加载…');
    try{
      const response=await fetch('api/course-script?course='+encodeURIComponent(id),{cache:'no-store'});if(!response.ok)throw Error('加载失败');
      content=await response.json();courseId=id;dirty=false;render();$('courseSelect').value=id;
      $('courseSave').disabled=false;$('coursePublish').disabled=false;message('已加载 '+content.name+' · 修订版 '+content.revision);
      history.replaceState(null,'','admin.html?course='+encodeURIComponent(id));
    }catch(error){message('加载失败：'+error.message);$('courseSelect').value=courseId;}
  }
  $('courseSelect').onchange=event=>loadCourse(event.target.value);
  $('courseReload').onclick=async()=>{await loadCatalog();await loadCourse();};
  async function createCourse(clone){
    if(saving)return;
    if(dirty&&!confirm('新建课程前会离开未发布的修改，是否继续？'))return;
    const name=prompt(clone?'新课程名称（复制当前内容）':'新课程名称','新课程');if(!name?.trim())return;
    const id='lesson-'+Date.now().toString(36);
    try{
      const response=await fetch('api/courses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name:name.trim(),cloneFrom:clone?courseId:undefined})});
      const result=await response.json();if(!response.ok)throw Error(result.error||'创建失败');
      dirty=false;await loadCatalog();await loadCourse(id);message('已创建课程。编辑章节与台词后保存发布。');
    }catch(error){message('新建失败：'+error.message);}
  }
  $('courseNew').onclick=()=>createCourse(false);$('courseClone').onclick=()=>createCourse(true);
  async function saveCourse(){
    if(!content||saving)return false;
    saving=true;$('courseSave').disabled=true;$('coursePublish').disabled=true;$('courseReload').disabled=true;message('正在保存…');
    ['courseSelect','courseNew','courseClone'].forEach(id=>$(id).disabled=true);
    $('courseFields').querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=true);
    try{
      const response=await fetch('api/course-script?course='+encodeURIComponent(courseId),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(content),signal:AbortSignal.timeout(15000)});
      const result=await response.json();if(!response.ok)throw Error(result.error||'保存失败');
      content.revision=result.revision;content.updatedAt=result.updatedAt;dirty=false;
      await loadCatalog();message('已保存修订版 '+result.revision+(courseId===activeCourseId?'，前台刷新后生效。':'。点击“设为前台课程”后，前台将展示这门课。'));
      return true;
    }catch(error){message('未确认保存成功：'+error.message+'。当前修改已保留。');return false;}
    finally{saving=false;['courseSave','coursePublish','courseReload','courseSelect','courseNew','courseClone'].forEach(id=>$(id).disabled=false);$('courseFields').querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=false);}
  }
  $('courseSave').onclick=saveCourse;
  $('coursePublish').onclick=async()=>{
    if(!content||saving)return;
    if(dirty&&!await saveCourse())return;
    saving=true;
    ['coursePublish','courseSave','courseReload','courseSelect','courseNew','courseClone'].forEach(id=>$(id).disabled=true);
    try{
      const response=await fetch('api/course-publishing',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({activeCourseId:courseId,revision:publishingRevision}),signal:AbortSignal.timeout(15000)});
      const result=await response.json();if(!response.ok)throw Error(result.error||'设置失败');
      await loadCatalog();message('已将“'+content.name+'”设为前台课程，前台刷新后生效。');
    }catch(error){message('前台课程未更新：'+error.message);}
    finally{saving=false;['coursePublish','courseSave','courseReload','courseSelect','courseNew','courseClone'].forEach(id=>$(id).disabled=false);}
  };
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  loadCatalog().then(()=>loadCourse()).catch(error=>message(error.message));
})();
