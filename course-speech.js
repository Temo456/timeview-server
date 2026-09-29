/* One speech plan shared by the renderer and the background audio builder. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TimeviewSpeech=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=1, digits=['零','一','二','三','四','五','六','七','八','九'];
  const phases=['新月','峨眉月','上弦月','盈凸月','满月','亏凸月','下弦月','残月'];
  const defaults={date:'{{来源}}{{日期}}，{{时间说明}}底部时间和画面已经一起更新了。',dateObservation:'同一时刻，各地用不同的当地时间表达。请再看一眼北京、伦敦与纽约，日期有没有变化？',report:'这一天的月相是{{月相}}，照亮比例约百分之{{照亮比例}}。',reportFailure:'这次报告没有准备好，我们先观察画面，不猜测具体结果。',received:'收到你的想法，我们一起看看。',noAnswer:'没关系，我们一起看。'};
  const spoken=text=>String(text).trim().replaceAll('星宿','星秀');
  const lookup=(text,voice)=>voice+':'+spoken(text);
  const hasSpeech=text=>/[\p{L}\p{N}]/u.test(text);
  function chunks(text){
    const chars=Array.from(String(text)),out=[];
    while(chars.length){
      let end=Math.min(80,chars.length);const sample=chars.slice(0,end).join(''),sentence=sample.match(/[。！？!?；;\n][”’」』]?/u);
      if(sentence)end=Array.from(sample.slice(0,sentence.index+sentence[0].length)).length;
      else if(end<chars.length){const stops=[...sample.matchAll(/[，,：:]/gu)].filter(m=>m.index>=20);if(stops.length)end=Array.from(sample.slice(0,stops.at(-1).index+1)).length;}
      out.push(chars.splice(0,end).join(''));
    }
    return out;
  }
  function number(value){
    const n=Number(value);if(!Number.isInteger(n)||n<0||n>100)throw Error('动态数字超出范围');
    if(n<10)return [digits[n]];
    if(n===100)return ['一','百'];
    return [...(n>=20?[digits[Math.floor(n/10)]]:[]),'十',...(n%10?[digits[n%10]]:[])];
  }
  function vocabulary(token){
    if(token==='来源')return ['我们用一个演示日期，','你选择的是'];
    if(token==='月相')return phases;
    const nums=[...digits,'十','百'];
    if(token==='日期')return [...nums,'年','月','日'];
    if(token==='时间说明')return [...nums,'采用北京时间','以北京时间中午十二点作演示。','点','分'];
    if(token==='城市时间')return [...nums,'北京是','伦敦是','纽约是','月','日','点','分'];
    if(token==='照亮比例')return nums;
    throw Error('未知语音占位符：'+token);
  }
  function variable(token,value){
    const text=String(value??'');
    if(token==='日期'){
      const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);if(!m)throw Error('日期格式无效');
      return [...m[1]].map(n=>digits[Number(n)]).concat('年',number(m[2]),'月',number(m[3]),'日');
    }
    if(token==='时间说明'){
      if(text==='以北京时间中午十二点作演示。')return [text];
      const m=/^采用北京时间(\d{2}):(\d{2})。$/.exec(text);if(!m)throw Error('时间格式无效');
      return ['采用北京时间',...number(m[1]),'点',...number(m[2]),'分'];
    }
    if(token==='城市时间'){
      const cities=[...text.matchAll(/(北京|伦敦|纽约)是(\d+)月(\d+)日\s*(\d+)[:：](\d+)/gu)];
      if(cities.length!==3)throw Error('城市时间格式无效');
      return cities.flatMap(m=>[m[1]+'是',...number(m[2]),'月',...number(m[3]),'日',...number(m[4]),'点',...number(m[5]),'分']);
    }
    if(token==='照亮比例')return number(value);
    if(!vocabulary(token).includes(text))throw Error('动态语音内容无效');
    return [text];
  }
  function plan(template,values={}){
    const parts=String(template).split(/(\{\{[^{}]+\}\})/g),out=[];let prefix='';
    function add(text,audio){
      if(!hasSpeech(text)){if(out.length)out.at(-1).text+=text;else prefix+=text;return;}
      out.push({text:prefix+text,parts:audio});prefix='';
    }
    for(const part of parts){
      const match=/^\{\{([^{}]+)\}\}$/.exec(part);
      if(match)add(String(values[match[1]]??''),variable(match[1],values[match[1]]));
      else chunks(part).forEach(text=>add(text,[spoken(text)]));
    }
    return out;
  }
  function enumerate(course){
    const items=new Map(),templates={...defaults,...course.templates};
    function add(text,voice){if(hasSpeech(text))items.set(lookup(text,voice),{text:spoken(text),voice});}
    function template(text,voice){
      for(const part of String(text||'').split(/(\{\{[^{}]+\}\})/g)){
        const m=/^\{\{([^{}]+)\}\}$/.exec(part);
        if(m)vocabulary(m[1]).forEach(s=>add(s,voice));else chunks(part).forEach(s=>add(s,voice));
      }
    }
    for(const row of course.lines){
      template(row.text,row.role==='axing'?'female':'male');
      if(row.type==='ask')for(const response of ['received','noAnswer'])template(templates[response]+row.answer,'male');
    }
    for(const name of ['date','dateObservation','report','reportFailure'])template(templates[name],name==='date'?'female':'male');
    return [...items.values()];
  }
  return {VERSION,spoken,lookup,chunks,number,variable,plan,enumerate};
});
