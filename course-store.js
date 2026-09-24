'use strict';
const fs = require('fs');
const path = require('path');
const defaults = require('./course-default.json');

const clone = value => JSON.parse(JSON.stringify(value));
const scenePattern = /^(?:|now|axes:[0-3]|moon:(?:[0-7]|cycle)|season:(?:spring|summer|autumn|winter|terms)|planet:(?:mercury|venus|earth|mars|jupiter|saturn|uranus|neptune|pluto)|layer:(?:zodiac|xiusu|voyager|threeBody)|report:topdown)$/;
const tokens = {date:['来源','日期','时间说明'],report:['月相','照亮比例']};

function contentText(value,label,max=1000,allowed=[]) {
  if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw Error(label+'需填写1至'+max+'字');
  for(const match of value.matchAll(/\{\{([^{}]+)\}\}/g))if(!allowed.includes(match[1]))throw Error(label+'含未知占位符：'+match[0]);
  return value.trim();
}

function validDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'2100-12-31')return false;
  const stamp=Date.parse(value+'T12:00:00Z');
  return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;
}

function validate(input,id) {
  if(!input||input.schemaVersion!==2||!Array.isArray(input.chapters)||!Array.isArray(input.lines))throw Error('课程结构不匹配，请重新加载后台');
  if(input.chapters.length<1||input.chapters.length>24||input.lines.length<1||input.lines.length>300)throw Error('课程需有1至24章、1至300段');
  const chapters=[],chapterIds=new Set();
  for(const item of input.chapters){
    if(!Number.isInteger(item.id)||item.id<0||item.id>100000||chapterIds.has(item.id))throw Error('章节编号重复或无效');
    if(!['earth','solar'].includes(item.view))throw Error('章节画面需选地球或太阳系');
    chapterIds.add(item.id);
    chapters.push({id:item.id,title:contentText(item.title,'章节标题',40),view:item.view});
  }
  const chapterOrder=new Map(chapters.map((ch,i)=>[ch.id,i]));
  const lineIds=new Set(),lines=[];
  let lastChapter=-1;
  for(const [i,item] of input.lines.entries()){
    if(typeof item.id!=='string'||!/^[-a-zA-Z0-9]{1,64}$/.test(item.id)||lineIds.has(item.id))throw Error('段落编号重复或无效');
    if(!chapterOrder.has(item.chapter)||chapterOrder.get(item.chapter)<lastChapter)throw Error('段落需按章节顺序排列');
    lastChapter=chapterOrder.get(item.chapter);lineIds.add(item.id);
    if(!['say','ask','date','example'].includes(item.type))throw Error('未知段落类型');
    if(!['ayuan','axing'].includes(item.role))throw Error('请选择阿远或阿星');
    const scene=item.scene||'';if(typeof scene!=='string'||!scenePattern.test(scene))throw Error('未知画面动作');
    const row={id:item.id,chapter:item.chapter,type:item.type,role:item.role,text:'',answer:'',fallback:'',scene};
    if(item.type!=='example')row.text=contentText(item.text,'第'+(i+1)+'段台词',1000,['城市时间']);
    if(item.type==='ask'){
      row.answer=contentText(item.answer,'第'+(i+1)+'段回应');
      if(!Array.isArray(item.choices)||item.choices.length<2||item.choices.length>6)throw Error('每道提问需提供2至6个选项');
      row.choices=item.choices.map(choice=>contentText(choice,'回复选项',60));
      if(new Set(row.choices).size!==row.choices.length)throw Error('回复选项不能重复');
    }
    if(item.type==='date'||item.type==='example'){
      if(!validDate(item.fallback))throw Error('备用日期无效');
      row.fallback=item.fallback;
      row.birthday=Boolean(item.birthday ?? (item.chapter>=9));
    }
    lines.push(row);
  }
  for(const chapter of chapters)if(!lines.some(line=>line.chapter===chapter.id))throw Error('每章至少需要一段讲解');
  const templates={};
  for(const name of Object.keys(defaults.templates))templates[name]=contentText(input.templates?.[name],'衔接语 '+name,1000,tokens[name]||[]);
  const settings={...defaults.settings,...input.settings};
  for(const name of Object.keys(defaults.settings))if(!Number.isInteger(settings[name])||settings[name]<1||settings[name]>600)throw Error('等待时长需为1至600秒的整数');
  return {schemaVersion:2,courseId:id,name:contentText(input.name,'课程名称',60),chapters,lines,templates,settings};
}

// The server published one fixed-layout lesson before multi-course support.
// Keep every unaffected line and setting, while replacing the chapters the user redesigned.
function migrateLegacy(saved) {
  const next=clone(defaults),oldLines=new Map(saved.lines.map(line=>[line.id,line]));
  for(const line of next.lines){
    const old=oldLines.get(line.id);
    if(!old||line.chapter===4||line.chapter===5)continue;
    for(const key of ['role','text','answer','choices','fallback'])if(old[key]!==undefined&&old[key]!=='')line[key]=clone(old[key]);
    if(line.text)line.text=line.text.replace(/不代表实际出生时刻|非实际出生时刻|不把它说成实际出生时刻/g,'').replace(/[，。；]\s*[，。；]/g,'。');
  }
  for(const chapter of next.chapters){
    const old=saved.chapters.find(item=>item.id===chapter.id);
    if(old&&chapter.id!==4&&chapter.id!==5)chapter.title=old.title;
  }
  next.settings={...next.settings,...saved.settings};
  next.templates={...next.templates,...saved.templates,report:next.templates.report};
  next.templates.date=next.templates.date.replace(/不代表实际出生时刻|非实际出生时刻/g,'');
  next.revision=saved.revision;next.updatedAt=saved.updatedAt;
  return next;
}

module.exports=function createCourseStore(dataDir){
  const primaryFile=path.join(dataDir,'course-content.json');
  const extraDir=path.join(dataDir,'courses');
  const courses=new Map();let loadError=false;
  const saveFile=(file,body)=>{
    fs.mkdirSync(path.dirname(file),{recursive:true});
    if(fs.existsSync(file))fs.copyFileSync(file,file+'.previous');
    const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(body,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file);
  };
  function load(file,id,fallback){
    if(!fs.existsSync(file))return clone(fallback);
    try{
      const raw=JSON.parse(fs.readFileSync(file,'utf8'));
      const converted=raw.schemaVersion===2?raw:migrateLegacy(raw);
      if(!Number.isSafeInteger(raw.revision)||raw.revision<0)throw Error('revision');
      return {...validate(converted,id),revision:raw.revision,updatedAt:raw.updatedAt};
    }catch(error){loadError=true;console.error('[course] saved script invalid:',file,error.message);return clone(fallback);}
  }
  courses.set(defaults.courseId,load(primaryFile,defaults.courseId,defaults));
  if(fs.existsSync(extraDir))for(const name of fs.readdirSync(extraDir)){
    if(!/^[-a-z0-9]{1,48}\.json$/.test(name))continue;
    const id=name.slice(0,-5);courses.set(id,load(path.join(extraDir,name),id,defaults));
  }
  const pathFor=id=>id===defaults.courseId?primaryFile:path.join(extraDir,id+'.json');
  const summary=course=>({id:course.courseId,name:course.name,chapters:course.chapters.length,revision:course.revision,updatedAt:course.updatedAt||null});
  const publishingFile=path.join(dataDir,'course-publishing.json');
  let publishing={activeCourseId:defaults.courseId,revision:0};
  if(fs.existsSync(publishingFile)){
    try{
      const saved=JSON.parse(fs.readFileSync(publishingFile,'utf8'));
      if(!courses.has(saved.activeCourseId)||!Number.isSafeInteger(saved.revision)||saved.revision<0)throw Error('invalid active course');
      publishing=saved;
    }catch(error){loadError=true;console.error('[course] publishing settings invalid:',error.message);}
  }
  const selected=req=>new URL(req.url,'http://local').searchParams.get('course')||publishing.activeCourseId;
  return {
    get:(id=publishing.activeCourseId)=>courses.get(id),
    list:()=>[...courses.values()].map(summary),
    async publish(req,res,sendJson,readBody){
      res.setHeader('Cache-Control','no-store');
      if(req.method==='GET')return sendJson(res,{...publishing,name:courses.get(publishing.activeCourseId).name});
      if(req.method!=='PUT')return sendJson(res,{error:'method not allowed'},405);
      if(loadError)return sendJson(res,{error:'课程数据异常，请先修复'},503);
      try{
        const body=await readBody(req);
        if(body.revision!==publishing.revision)return sendJson(res,{error:'前台课程已在其他窗口调整，请重新加载后再设置'},409);
        if(!courses.has(body.activeCourseId))return sendJson(res,{error:'课程不存在'},400);
        const next={activeCourseId:body.activeCourseId,revision:publishing.revision+1,updatedAt:new Date().toISOString()};
        try{saveFile(publishingFile,next);}catch(error){console.error(error);return sendJson(res,{error:'前台课程设置保存失败，请重试'},500);}
        publishing=next;
        return sendJson(res,{ok:true,...publishing,name:courses.get(publishing.activeCourseId).name});
      }catch(error){return sendJson(res,{error:error.message},400);}
    },
    async handle(req,res,sendJson,readBody){
      res.setHeader('Cache-Control','no-store');
      const id=selected(req),current=courses.get(id);
      if(!current)return sendJson(res,{error:'课程不存在'},404);
      if(req.method==='GET')return sendJson(res,current);
      if(req.method!=='PUT')return sendJson(res,{error:'method not allowed'},405);
      if(loadError)return sendJson(res,{error:'已保存的课程文件异常，请先恢复文件；本次未覆盖'},503);
      try{
        const body=await readBody(req);
        if(body.revision!==current.revision)return sendJson(res,{error:'课程已在其他窗口更新，请重新加载后合并'},409);
        const next={...validate(body,id),revision:current.revision+1,updatedAt:new Date().toISOString()};
        try{saveFile(pathFor(id),next);}catch(error){console.error(error);return sendJson(res,{error:'服务器保存失败，原内容未替换，请重试'},500);}
        courses.set(id,next);return sendJson(res,{ok:true,revision:next.revision,updatedAt:next.updatedAt});
      }catch(error){return sendJson(res,{error:error.message},400);}
    },
    async catalog(req,res,sendJson,readBody){
      res.setHeader('Cache-Control','no-store');
      if(req.method==='GET')return sendJson(res,{courses:[...courses.values()].map(summary),...publishing});
      if(req.method!=='POST')return sendJson(res,{error:'method not allowed'},405);
      if(loadError)return sendJson(res,{error:'课程数据异常，请先修复'},503);
      try{
        const body=await readBody(req);
        const id=body.id;
        if(typeof id!=='string'||!/^[-a-z0-9]{2,48}$/.test(id)||courses.has(id))throw Error('课程编号需为2至48位小写字母、数字或连字符，且不能重复');
        const name=contentText(body.name,'课程名称',60);
        const source=body.cloneFrom?courses.get(body.cloneFrom):null;
        if(body.cloneFrom&&!source)throw Error('原课程不存在');
        const initial=source?clone(source):{
          ...clone(defaults),chapters:[{id:0,title:'第一章',view:'earth'}],
          lines:[{id:'line-1',chapter:0,type:'say',role:'ayuan',text:'请在后台填写这门课的第一段讲解。',scene:''}]
        };
        const next={...validate({...initial,name},id),revision:0,updatedAt:new Date().toISOString()};
        try{saveFile(pathFor(id),next);}catch(error){console.error(error);return sendJson(res,{error:'新课程保存失败'},500);}
        courses.set(id,next);return sendJson(res,{ok:true,course:summary(next)},201);
      }catch(error){return sendJson(res,{error:error.message},400);}
    }
  };
};

module.exports.validate=validate;
module.exports.migrateLegacy=migrateLegacy;
