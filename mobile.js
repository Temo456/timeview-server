/* Phone layout, shared by Earth, Solar and the content editor. No astronomy state. */
(function(){
  'use strict';
  const query=matchMedia('(max-width:760px), (max-width:1024px) and (max-height:600px) and (pointer:coarse)');
  const root=document.documentElement;
  let bar=document.querySelector('.bottombar'),original=bar?Array.from(bar.children):[];
  const watched=new WeakSet(),keyboardControls=new WeakSet(),cards=new WeakMap(),boundBars=new WeakSet();
  const popups=['datePicker','spdPopup','tzPopup','skinPopup','layerPopup'];
  let frame=0,mounted=false,more,tools,shade,sceneBounds=null,lastBounds='',panelReady=false;
  const active=()=>query.matches&&!document.body.classList.contains('scrsv');
  const visible=el=>el&&!el.hidden&&getComputedStyle(el).display!=='none';
  const set=(el,name,value)=>{if(el.style[name]!==value)el.style[name]=value;};
  const variable=(name,value)=>{if(root.style.getPropertyValue(name)!==value)root.style.setProperty(name,value);};
  const label=(el,name)=>{if(el){el.setAttribute('aria-label',name);el.title=name;}};
  function schedule(){if(!frame)frame=requestAnimationFrame(layout);}
  const sizes=new ResizeObserver(schedule),changes=new MutationObserver(schedule);
  function watch(el,text=false){
    if(!el||watched.has(el))return;watched.add(el);sizes.observe(el);
    changes.observe(el,{attributes:true,attributeFilter:['style','class','hidden'],childList:text,characterData:text,subtree:text});
  }
  function button(text,id){const el=document.createElement('button');el.type='button';el.textContent=text;if(id)el.id=id;return el;}
  function keyboard(el){
    if(!el||el.matches('button,a,input,select')||keyboardControls.has(el))return;
    keyboardControls.add(el);
    el.setAttribute('role','button');el.tabIndex=0;
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});
  }
  function closeMore(){if(tools){tools.hidden=true;bar.classList.remove('tv-tools-open');more.setAttribute('aria-expanded','false');}}
  function closePopups(){for(const id of popups){const el=document.getElementById(id);if(el)el.style.display='none';}schedule();}
  function mount(){
    if(mounted||!bar)return;mounted=true;
    const date=document.createElement('div'),transport=document.createElement('div');
    date.className='tv-mobile-date';transport.className='tv-mobile-transport';
    tools=document.createElement('div');tools.id='tvMobileTools';tools.className='tv-mobile-tools';tools.hidden=true;tools.setAttribute('aria-label','更多观察工具');
    more=button('更多 ···','tvMobileMore');more.setAttribute('aria-expanded','false');more.setAttribute('aria-controls',tools.id);
    more.onclick=()=>{const opening=tools.hidden;closePopups();tools.hidden=!opening;bar.classList.toggle('tv-tools-open',opening);more.setAttribute('aria-expanded',String(opening));schedule();};
    const main=['pSlow','pPlay','pFast','pNow'];
    if(document.getElementById('pGod')){main.push('pGod');transport.classList.add('tv-has-god-hand');}
    for(const el of original){
      if(el.id==='dateText')date.append(el);
      else if(!main.includes(el.id))tools.append(el);
      keyboard(el);
    }
    for(const id of main)transport.append(document.getElementById(id));transport.append(more);
    bar.append(date,transport,tools);
    for(const [id,name] of Object.entries({pSlow:'减慢时间',pFast:'加快时间',pPlay:'播放或暂停时间',pPrev:'向前调整时间',pNext:'向后调整时间'}))label(document.getElementById(id),name);
  }
  function unmount(){
    if(!mounted)return;closeMore();bar.replaceChildren(...original);mounted=false;more=tools=null;
  }
  function bindBar(){
    const next=document.querySelector('.bottombar');
    if(next!==bar){unmount();bar=next;original=bar?Array.from(bar.children):[];sceneBounds=null;lastBounds='';}
    if(bar&&!boundBars.has(bar)){
      boundBars.add(bar);bar.addEventListener('click',e=>{if(e.target.closest('.tv-mobile-tools'))queueMicrotask(()=>{closeMore();schedule();});});
    }
  }
  function initPanel(panel){
    if(!panel||panelReady)return;panelReady=true;
    const actions=document.createElement('div');actions.className='tv-panel-actions tv-mobile-only';
    const expand=button('展开讲解','tvMobileExpand'),mini=button('看画面','tvMobileMini');
    expand.setAttribute('aria-expanded','false');expand.setAttribute('aria-controls','tvBody');mini.setAttribute('aria-expanded','true');mini.setAttribute('aria-controls','tvBody');
    expand.onclick=()=>{panel.classList.remove('tv-panel-mini');panel.classList.toggle('tv-panel-expanded');schedule();};
    mini.onclick=()=>{panel.classList.remove('tv-panel-expanded');panel.classList.toggle('tv-panel-mini');schedule();};
    actions.append(expand,mini);panel.querySelector('.top').insertBefore(actions,document.getElementById('tvClose'));
    const chapters=button('换章节','tvMobileChapters');chapters.className='tv-mobile-only';chapters.setAttribute('aria-expanded','false');chapters.setAttribute('aria-controls','tvCues');
    chapters.onclick=()=>{panel.classList.toggle('tv-show-chapters');schedule();};panel.querySelector('.stage-nav').append(chapters);
    document.getElementById('tvCues').addEventListener('click',()=>{panel.classList.remove('tv-show-chapters');schedule();});
    watch(panel);
  }
  function summary(card){
    if(cards.has(card))return cards.get(card);
    const row=document.createElement('div');row.className='tv-card-summary tv-mobile-only';
    const open=button('查看资料'),close=button('×');open.className='tv-card-open';close.className='tv-card-dismiss';
    label(close,'关闭资料卡');open.setAttribute('aria-expanded','false');
    open.onclick=()=>{card.classList.toggle('tv-card-expanded');schedule();};
    close.onclick=()=>{card.hidden=true;card.style.display='none';card.classList.remove('tv-card-expanded');schedule();};
    row.append(open,close);card.prepend(row);const result={open,row};cards.set(card,result);watch(card,true);return result;
  }
  function layoutCards(selector){
    if(!active())return false;
    const header=document.querySelector('.topbar'),safeTop=header?.getBoundingClientRect().bottom||50;
    const top=safeTop+(document.getElementById('einfo')?27:10),bottom=bar?.getBoundingClientRect().top||innerHeight-12;
    for(const card of document.querySelectorAll(selector)){
      const {open}=summary(card);if(!card.classList.contains('tv-mobile-card'))card.classList.add('tv-mobile-card');
      const title=card.querySelector('.cv-heading,.card-name,.tb-title,.hdr .title')?.textContent||'观察资料';
      const expanded=card.classList.contains('tv-card-expanded'),text=title+(expanded?' · 收起':' · 查看');
      if(open.textContent!==text)open.textContent=text;
      open.setAttribute('aria-expanded',String(expanded));
      const width=Math.min(expanded?360:280,innerWidth-20);
      for(const [name,value] of Object.entries({boxSizing:'border-box',left:'10px',right:'auto',top:top+'px',bottom:'auto',transform:'none',width:width+'px',maxHeight:Math.max(44,bottom-top-10)+'px',overflowY:expanded?'auto':'hidden',overscrollBehavior:'contain',pointerEvents:'auto'}))set(card,name,value);
      if(card.matches('#cardMask,#fortMask')){
        set(card,'background','none');const content=card.querySelector('.card,.fort-card');
        if(content){set(content,'width','100%');set(content,'maxWidth','none');set(content,'maxHeight','none');}
      }
    }
    return true;
  }
  function layout(){
    frame=0;bindBar();const enabled=active();root.classList.toggle('tv-mobile',enabled);
    if(!enabled){
      unmount();if(shade)shade.style.display='none';sceneBounds=null;
      for(const card of document.querySelectorAll('.tv-mobile-card'))card.classList.remove('tv-mobile-card');
      window.TimeviewCards?.layout();return;
    }
    const viewport=window.visualViewport,vh=viewport?.height||innerHeight,vt=viewport?.offsetTop||0;
    variable('--tv-vh',vh+'px');variable('--tv-vtop',vt+'px');variable('--tv-keyboard',Math.max(0,innerHeight-vh-vt)+'px');
    mount();const panel=document.getElementById('tv-assist');initPanel(panel);
    for(const id of popups)watch(document.getElementById(id));watch(bar);watch(document.querySelector('.topbar'));
    if(!shade&&bar){shade=button('','tvMobileShade');shade.className='tv-mobile-only';label(shade,'关闭弹窗');shade.onclick=()=>{closeMore();closePopups();};document.body.append(shade);}
    const popupOpen=popups.some(id=>visible(document.getElementById(id)));
    if(popupOpen)closeMore();
    if(shade)set(shade,'display',popupOpen||(tools&&!tools.hidden)?'block':'none');
    const toolbar=bar?.getBoundingClientRect();
    if(toolbar){variable('--tv-bar-height',toolbar.height+'px');variable('--tv-panel-bottom',(innerHeight-toolbar.top+8)+'px');}
    if(panel){
      const expanded=panel.classList.contains('tv-panel-expanded'),mini=panel.classList.contains('tv-panel-mini')&&!panel.classList.contains('replying');
      const expand=document.getElementById('tvMobileExpand'),minimize=document.getElementById('tvMobileMini');
      expand.textContent=expanded?'收起讲解':'展开讲解';expand.setAttribute('aria-expanded',String(expanded));
      minimize.textContent=mini?'显示讲解':'看画面';minimize.setAttribute('aria-expanded',String(!mini));
      document.getElementById('tvMobileChapters').setAttribute('aria-expanded',String(panel.classList.contains('tv-show-chapters')));
    }
    layoutCards('#planetCard,#threeBodyCard,#tv-course-visual,#cardMask,#fortMask');
    if(!bar)return;
    const top=(document.querySelector('.topbar')?.getBoundingClientRect().bottom||50)+(document.getElementById('einfo')?26:10);
    let left=12,right=innerWidth-12,bottom=toolbar.top-12;
    if(panel?.classList.contains('on')){
      const p=panel.getBoundingClientRect();
      if(innerWidth>innerHeight&&innerHeight<=600)right=p.left-12;else bottom=p.top-12;
    }
    sceneBounds={left,right:Math.max(left+80,right),top,bottom:Math.max(top+80,bottom)};
    const next=Object.values(sceneBounds).map(Math.round).join(',');
    if(next!==lastBounds){lastBounds=next;window.dispatchEvent(new Event('timeview:mobile-layout'));}
  }
  window.TimeviewMobile={active,layoutCards,sceneRect:(view)=>{
    if(!active()||!sceneBounds)return null;
    if(!view||view===window.TIMEVIEW)return sceneBounds;
    // The Earth header has one additional information line. Predict its scene
    // area for the return camera without mounting a second set of controls.
    const top=(document.querySelector('.topbar')?.getBoundingClientRect().bottom||50)+(view==='earth'?26:10);
    return {...sceneBounds,top,bottom:Math.max(top+80,sceneBounds.bottom)};
  },refresh:schedule,beforeViewChange(){closePopups();unmount();}};
  window.addEventListener('timeview:view-changed',()=>{if(frame)cancelAnimationFrame(frame);layout();});
  query.addEventListener('change',()=>{closePopups();schedule();});
  addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
  bindBar();
  document.addEventListener('keydown',e=>{if(active()&&e.key==='Escape'){closeMore();closePopups();}});
  document.addEventListener('click',e=>{if(!active())return;if(!e.target.closest('.bottombar'))closeMore();schedule();});
  new MutationObserver(schedule).observe(document.body,{childList:true});
  schedule();
})();
