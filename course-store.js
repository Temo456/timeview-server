'use strict';
const fs = require('fs');
const path = require('path');
const defaults = require('./course-default.json');
const tokens = {date:['来源','日期','时间说明'],report:['月相','照亮比例']};

function validate(input) {
  if (!input || !Array.isArray(input.chapters) || !Array.isArray(input.lines) ||
      input.chapters.length !== defaults.chapters.length || input.lines.length !== defaults.lines.length) throw Error('课程结构不匹配，请重新加载后台');
  function text(value, label, max=1000, allowed=[]) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw Error(label+'需填写1至'+max+'字');
    for (const m of value.matchAll(/\{\{([^{}]+)\}\}/g)) if (!allowed.includes(m[1])) throw Error(label+'含未知占位符：'+m[0]);
    return value.trim();
  }
  const chapters = defaults.chapters.map((base,i) => {
    const item=input.chapters[i];if(!item||item.id!==base.id)throw Error('章节顺序不匹配');
    return {id:base.id,title:text(item.title,'章节标题',40)};
  });
  const lines=defaults.lines.map((base,i)=>{
    const item=input.lines[i];if(!item||item.id!==base.id||item.type!==base.type||item.chapter!==base.chapter)throw Error('段落结构不匹配');
    if(!['ayuan','axing'].includes(item.role))throw Error('请选择阿远或阿星');
    const row={...base,role:item.role};
    if(base.text)row.text=text(item.text,'第'+(i+1)+'段台词',1000,base.text.includes('{{城市时间}}')?['城市时间']:[]);
    if(base.answer)row.answer=text(item.answer,'第'+(i+1)+'段回应');
    if(base.fallback){
      const d=item.fallback,ts=Date.parse(d+'T12:00:00Z');
      if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||d<'1900-01-01'||d>'2100-12-31'||!Number.isFinite(ts)||new Date(ts).toISOString().slice(0,10)!==d)throw Error('备用日期无效');
      row.fallback=d;
    }
    return row;
  });
  const templates={};
  for(const name of Object.keys(defaults.templates)) templates[name]=text(input.templates?.[name],'衔接语 '+name,1000,tokens[name]||[]);
  return {chapters,lines,templates};
}

module.exports = function createCourseStore(dataDir) {
  const file=path.join(dataDir,'course-content.json');
  let current=JSON.parse(JSON.stringify(defaults)),loadError=false;
  if(fs.existsSync(file))try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));current={...validate(saved),revision:saved.revision,updatedAt:saved.updatedAt};if(!Number.isSafeInteger(current.revision))throw Error('revision');}catch(_){loadError=true;console.error('[course] saved script invalid; keeping file and using defaults');}
  return {
    get:()=>current,
    async handle(req,res,sendJson,readBody){
      res.setHeader('Cache-Control','no-store');
      if(req.method==='GET')return sendJson(res,current);
      if(req.method!=='PUT')return sendJson(res,{error:'method not allowed'},405);
      if(loadError)return sendJson(res,{error:'已保存的课程文件异常，请先恢复文件；本次未覆盖'},503);
      try{
        const body=await readBody(req);
        if(body.revision!==current.revision)return sendJson(res,{error:'其他窗口已经更新内容，请保留本次修改并重新加载后合并'},409);
        const next={...validate(body),revision:current.revision+1,updatedAt:new Date().toISOString()};
        const temp=file+'.tmp';
        try{fs.mkdirSync(dataDir,{recursive:true});if(fs.existsSync(file))fs.copyFileSync(file,file+'.previous');fs.writeFileSync(temp,JSON.stringify(next,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file);}catch(_){return sendJson(res,{error:'服务器保存失败，原内容未替换，请重试'},500);}
        current=next;return sendJson(res,{ok:true,revision:next.revision,updatedAt:next.updatedAt});
      }catch(e){return sendJson(res,{error:e.message},400);}
    }
  };
};
