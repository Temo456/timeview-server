/* Shared picker labels. Festivals recur by civil date; no holiday/workday schedule. */
(function(root){
  'use strict';
  const lunar=typeof module!=='undefined'&&module.exports?require('./lunar.js'):root.TimeviewLunar;
  const termDays=typeof module!=='undefined'&&module.exports?require('./calendar-terms.js'):root.TimeviewTermDays;
  const terms='小寒 大寒 立春 雨水 惊蛰 春分 清明 谷雨 立夏 小满 芒种 夏至 小暑 大暑 立秋 处暑 白露 秋分 寒露 霜降 立冬 小雪 大雪 冬至'.split(' ');
  const fixed={'1-1':'元旦','2-14':'情人节','3-8':'妇女节','3-12':'植树节','5-1':'劳动节','5-4':'青年节','6-1':'儿童节','9-10':'教师节','10-1':'国庆节','12-25':'圣诞节'};
  const traditional={'1-1':'春节','1-15':'元宵节','2-2':'龙抬头','5-5':'端午节','7-7':'七夕','7-15':'中元节','8-15':'中秋节','9-9':'重阳节','12-8':'腊八节'};
  const months='正 二 三 四 五 六 七 八 九 十 冬 腊'.split(' ');
  function civilDate(y,m,d){const date=new Date(0);date.setUTCFullYear(y,m-1,d);date.setUTCHours(0,0,0,0);return date;}
  function dayInfo(y,m,d){
    const events=[],L=lunar||root.TimeviewLunar,record=L?.solarToLunar(y,m,d);
    const add=(name,kind)=>{if(name)events.push({name,kind})};
    add(fixed[m+'-'+d],'festival');
    const weekDay=civilDate(y,m,d).getUTCDay();
    if(weekDay===0&&m===5&&d>=8&&d<=14)add('母亲节','festival');
    if(weekDay===0&&m===6&&d>=15&&d<=21)add('父亲节','festival');
    if(record&&!record.isLeap)add(traditional[record.month+'-'+record.day],'festival');
    if(record?.month===12&&!record.isLeap){
      const next=civilDate(y,m,d+1),nextLunar=L.solarToLunar(next.getUTCFullYear(),next.getUTCMonth()+1,next.getUTCDate());
      if(nextLunar?.month===1&&nextLunar.day===1&&!nextLunar.isLeap)add('除夕','festival');
    }
    const days=termDays[y];
    if(days)for(let i=(m-1)*2;i<m*2;i++)if(days[i]===d)add(terms[i],'term');
    const lunarText=record?(record.isLeap?'闰':'')+months[record.month-1]+'月'+L.lDayStr(record.day):'';
    return {events,lunar:record,lunarText,dayLabel:record?(record.day===1?(record.isLeap?'闰':'')+months[record.month-1]+'月':L.lDayStr(record.day)):'',label:y+'年'+m+'月'+d+'日'+(lunarText?' · 农历'+lunarText:'')+(events.length?' · '+events.map(e=>e.name).join(' · '):'')};
  }
  function decorateCell(el,y,m,d){
    const info=dayInfo(y,m,d);el.dataset.day=String(d);el.title=info.label;
    el.setAttribute('aria-label',info.label);el.setAttribute('aria-pressed',String(el.classList.contains('selected')));
    const number=document.createElement('span');number.className='dp-number';number.textContent=d;el.append(number);
    for(const event of info.events){const label=document.createElement('span');label.className='dp-annotation '+event.kind;label.textContent=event.name;el.append(label);}
    if(!info.events.length){const label=document.createElement('span');label.className='dp-annotation lunar';label.textContent=info.dayLabel;el.append(label);}
  }
  function selection(y,m,d){document.getElementById('dpEvents').textContent=dayInfo(y,m,d).label;}
  // Both views edit the same civil-date draft; changing lunar fields never applies it.
  function lunarPicker(getDate,setDate){
    const L=lunar||root.TimeviewLunar;
    const year=document.getElementById('lunarYear'),month=document.getElementById('lunarMonth'),day=document.getElementById('lunarDay'),hour=document.getElementById('lunarHour'),info=document.getElementById('lunarInfo');
    for(let y=1900;y<=2100;y++)year.add(new Option(y+'年',y));
    '子 丑 寅 卯 辰 巳 午 未 申 酉 戌 亥'.split(' ').forEach((name,i)=>hour.add(new Option(name+'时（'+((i*2+23)%24)+'–'+(i*2+1)+'点）',i)));
    const selectedMonth=()=>L.lunarMonths(Number(year.value)).find(m=>m.m===Math.abs(Number(month.value))&&m.isLeap===(Number(month.value)<0));
    function days(preferred=Number(day.value)||1){
      day.replaceChildren();const count=selectedMonth()?.days||29;
      for(let d=1;d<=count;d++)day.add(new Option(L.lDayStr(d),d));day.value=Math.min(count,preferred);
    }
    function monthsForYear(preferred=Number(month.value)||1){
      month.replaceChildren();for(const m of L.lunarMonths(Number(year.value)))month.add(new Option(m.label,m.isLeap?-m.m:m.m));
      if(Array.from(month.options).some(o=>Number(o.value)===preferred))month.value=preferred;days();
    }
    function update(){
      const date=L.lunarToSolar(Number(year.value),Math.abs(Number(month.value)),Number(day.value),Number(month.value)<0);
      if(!date)return;setDate(date.y,date.m,date.d);info.textContent='对应公历：'+dayInfo(date.y,date.m,date.d).label;
    }
    year.onchange=()=>{monthsForYear();update()};month.onchange=()=>{days();update()};day.onchange=update;
    hour.onchange=()=>{document.getElementById('dpTime').value=String(Number(hour.value)*2).padStart(2,'0')+':00:00'};
    return ()=>{
      const date=getDate(),r=L.solarToLunar(date.y,date.m,date.d);
      for(const el of [year,month,day,hour])el.disabled=!r;
      if(!r){info.textContent='该日期超出农历选择范围，请使用公历。';return;}
      year.value=r.year;monthsForYear(r.isLeap?-r.month:r.month);days(r.day);
      const h=Number(document.getElementById('dpTime').value.split(':')[0]);hour.value=Math.floor((h+1)%24/2);
      info.textContent='对应公历：'+dayInfo(date.y,date.m,date.d).label;
    };
  }
  const api={dayInfo,decorateCell,selection,lunarPicker};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TimeviewCalendar=api;
  if(typeof document==='undefined')return;
  const style=document.createElement('style');style.textContent=`
    #dpGrid .dp-cell{box-sizing:border-box;width:100%;min-width:0;height:54px;flex-direction:column;gap:1px;padding:3px 0;border:1px solid transparent;background:transparent;font:inherit;color:#bfe4f5}
    #dpGrid .dp-cell.head{height:24px;font-size:11px;color:#7994a8}#dpGrid .dp-cell.other{color:#587080}
    #dpGrid button.dp-cell:not(.selected):hover{background:#5fd6f01f}#dpGrid button.dp-cell:focus-visible{outline:2px solid #f5c451;outline-offset:-2px}
    #dpGrid .dp-cell.today{border-color:#5fd6f0}#dpGrid .dp-cell.selected{background:linear-gradient(135deg,#5fd6f0,#2aa9c8);color:#04121c;font-weight:700}
    #dpGrid .dp-number{font-size:14px;line-height:18px}#dpGrid .dp-annotation{font-size:10px;line-height:12px;white-space:nowrap}
    #dpGrid .festival,.dp-legend .festival{color:#f5c484}#dpGrid .term,.dp-legend .term{color:#79d9b3}#dpGrid .lunar{color:#95aebd}
    #dpGrid .selected .dp-annotation{color:#12343c}#dpEvents{font-size:11px;color:#d7e5ec;line-height:1.7;min-height:38px;margin-top:7px}
    .dp-legend{font-size:10px;color:#819dad;display:flex;gap:12px;margin-top:8px}#datePicker{max-height:calc(100dvh - 100px);overflow-y:auto;overscroll-behavior:contain}
    #datePicker .dp-actions{display:flex;position:sticky;bottom:0;background:#091724;border-top:1px solid #5fd6f026;z-index:1}
    #datePicker button.dp-btn{border:0;background:transparent;font:inherit;font-size:13px;cursor:pointer;min-height:44px}
    #datePicker #dpConfirm{background:#5fd6f0;color:#06202c;font-weight:700}#datePicker .dp-btn:focus-visible{outline:2px solid #f5c451;outline-offset:-3px}
    #datePicker #dpTime{width:140px!important}
  `;document.head.append(style);
})(globalThis);
