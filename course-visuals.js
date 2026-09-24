/* Visual teaching cards share one unobtrusive overlay on Earth and Solar views. */
(function(){
  'use strict';
  const names=['新月','峨眉月','上弦月','盈凸月','满月','亏凸月','下弦月','残月'];
  const days=['初一前后','初三前后','初八前后','十一前后','十五或十六','十八前后','廿三前后','廿六前后'];
  const card=document.createElement('section');card.id='tv-course-visual';card.hidden=true;card.setAttribute('aria-live','polite');
  const heading=document.createElement('div');heading.className='cv-heading';
  const canvas=document.createElement('canvas');canvas.width=132;canvas.height=132;canvas.setAttribute('aria-label','月相亮面示意');
  const diagram=document.createElement('div');diagram.className='cv-diagram';
  const note=document.createElement('p');note.className='cv-note';
  card.append(heading,canvas,diagram,note);document.body.append(card);
  const style=document.createElement('style');style.textContent=`
    #tv-course-visual{position:fixed;left:18px;top:68px;z-index:19;width:min(310px,calc(100vw - 36px));padding:15px 17px;color:#e8eff0;background:linear-gradient(155deg,#10212de9,#08131fea);border:1px solid #b6c7cc47;border-radius:16px;box-shadow:0 18px 45px #0007;backdrop-filter:blur(12px);pointer-events:none;font:13px/1.55 'Microsoft YaHei','PingFang SC',sans-serif}
    #tv-course-visual[hidden]{display:none}#tv-course-visual .cv-heading{font:20px/1.35 'STSong','SimSun',serif;color:#f2dbab}#tv-course-visual canvas{display:block;width:132px;height:132px;margin:7px auto 2px}#tv-course-visual .cv-diagram{min-height:58px}#tv-course-visual .cv-diagram svg{display:block;width:100%;height:auto}#tv-course-visual .cv-note{margin:7px 0 0;color:#b7c8cb;font-size:11px}#tv-course-visual .cv-term{display:flex;justify-content:space-between;color:#d9c38c;border-top:1px solid #ffffff20;padding-top:6px}
    @media(max-width:600px){#tv-course-visual{left:10px;top:58px;width:min(240px,calc(100vw - 20px));padding:10px 12px}#tv-course-visual .cv-heading{font-size:16px}#tv-course-visual canvas{width:86px;height:86px;margin:2px auto}#tv-course-visual .cv-note{font-size:10px}}
  `;document.head.append(style);
  function show(){window.TimeviewCards.show(card);}
  function phase(index){
    const ctx=canvas.getContext('2d'),size=canvas.width,c=size/2,r=49;
    ctx.clearRect(0,0,size,size);
    const image=ctx.createImageData(size,size),angle=index*Math.PI/4,sx=Math.sin(angle),sz=-Math.cos(angle);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const nx=(x-c)/r,ny=(y-c)/r,rr=nx*nx+ny*ny;
      if(rr>1)continue;
      const nz=Math.sqrt(1-rr),lit=nx*sx+nz*sz>0,shade=lit?Math.max(0.58,0.84+0.16*nz):0.18;
      const offset=(y*size+x)*4;
      image.data[offset]=Math.round(227*shade);image.data[offset+1]=Math.round(224*shade);image.data[offset+2]=Math.round(210*shade);image.data[offset+3]=255;
    }
    ctx.putImageData(image,0,0);
    ctx.strokeStyle='#d8c895';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(c,c,r,0,Math.PI*2);ctx.stroke();
  }
  function moon(value,example){
    const index=value==='cycle'?0:Math.max(0,Math.min(7,Number(value)||0));
    canvas.style.display='block';
    heading.textContent=value==='cycle'?'一个朔望月 · 约29.53天':names[index]+' · '+days[index];
    const phaseIndex=Number.isFinite(example?.el)?example.el/45:index;
    phase(phaseIndex);show();
    const a=phaseIndex*Math.PI/4,mx=85+45*Math.cos(a),my=54-45*Math.sin(a);
    diagram.innerHTML=`<svg viewBox="0 0 250 108" aria-label="太阳、地球与月球的位置示意"><circle cx="85" cy="54" r="45" fill="none" stroke="#7797a5" stroke-dasharray="3 4"/><circle cx="85" cy="54" r="9" fill="#3d8ab1"/><text x="74" y="82" fill="#b9d5e1" font-size="10">地球</text><circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="5" fill="#e5dfc9"/><text x="${(mx+7).toFixed(1)}" y="${(my-6).toFixed(1)}" fill="#eee3be" font-size="10">月球</text><circle cx="215" cy="54" r="17" fill="#dbaa55"/><path d="M192 54h-32" stroke="#e7c57a" stroke-width="2" marker-end="url(#arrow)"/><defs><marker id="arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0l5 2.5L0 5" fill="#e7c57a"/></marker></defs><text x="203" y="82" fill="#e7c57a" font-size="10">太阳</text></svg>`;
    note.textContent=value==='cycle'?'亮面按新月、盈、满月、亏的顺序循环；农历月份从朔日开始。':'示意图按北半球观测方向绘制，实际月日和升落时刻会变化。';
    if(example){
      const date=document.createElement('div');date.className='cv-term';
      date.textContent='示例日期 '+example.date+' · '+example.lunar;
      diagram.append(date);
    }
  }
  const seasonNames={spring:'春分',summer:'夏至',autumn:'秋分',winter:'冬至',terms:'二十四节气'};
  const angles={spring:0,summer:90,autumn:180,winter:270,terms:0};
  function season(value){
    heading.textContent=seasonNames[value]||'二分二至';canvas.style.display='none';show();
    const active=angles[value]??0;
    const ticks=Array.from({length:24},(_,i)=>{
      const a=i*Math.PI/12,x1=125+42*Math.cos(a),y1=53-42*Math.sin(a),x2=125+47*Math.cos(a),y2=53-47*Math.sin(a);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${i%6===0?'#e8cb89':'#718e9b'}" stroke-width="${i%6===0?2:1}"/>`;
    }).join('');
    const theta=active*Math.PI/180,ex=125+42*Math.cos(theta),ey=53-42*Math.sin(theta);
    diagram.innerHTML=`<svg viewBox="0 0 250 112" aria-label="地球公转轨道和二十四节气示意"><circle cx="125" cy="53" r="42" fill="none" stroke="#7297a4"/>${ticks}<circle cx="125" cy="53" r="8" fill="#dcab55"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="6" fill="#57a9d3"/><line x1="${(ex-4).toFixed(1)}" y1="${(ey+11).toFixed(1)}" x2="${(ex+4).toFixed(1)}" y2="${(ey-11).toFixed(1)}" stroke="#e4d8a0" stroke-width="2"/><text x="152" y="25" fill="#c6d5d8" font-size="10">黄赤交角约23.4°</text><text x="2" y="105" fill="#b5c9cc" font-size="10">每格15°太阳视黄经</text></svg><div class="cv-term"><span>春分 · 夏至</span><span>秋分 · 冬至</span></div>`;
    note.textContent='观察地球特写中的地轴方向，比较四季的日照变化。';
  }
  function report(data){
    heading.textContent=data.date+' · 天文历法快照';canvas.style.display='block';
    const age=Number(data.moonAge),index=Number.isFinite(age)?Math.round(age/29.530588*8)%8:0;
    phase(index);show();
    diagram.replaceChildren();
    const first=document.createElement('div');first.className='cv-term';first.textContent=`${data.moonPhase} · 亮度 ${data.moonIllum}%`;
    const second=document.createElement('div');second.className='cv-term';second.textContent=`${data.lunar} · ${data.solarTerm}`;
    const third=document.createElement('div');third.className='cv-term';third.textContent=`星宿：${data.moonMansion||'二十八星宿'}`;
    diagram.append(first,second,third);
    note.textContent='俯视图展示这一天的太阳系布局。';
  }
  function hide(){card.hidden=true;card.style.display='none';canvas.style.display='block';}
  window.TimeviewCourseVisuals={moon,season,report,hide};
})();
