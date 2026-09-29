'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),Speech=require('./course-speech');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const copy=value=>JSON.parse(JSON.stringify(value));
module.exports=function createCourseAudio({dataDir,profile,synthesize,current,concurrency=2,retryDelay=2000}){
  const root=path.join(dataDir,'course-audio'),jobs=new Map(),queue=[],inflight=new Map();let running=false;
  for(const folder of ['clips','index','manifests','latest'])fs.mkdirSync(path.join(root,folder),{recursive:true});
  const profileId=hash(JSON.stringify({profile,format:'mp3',speech:Speech.VERSION}));
  const read=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){return null;}};
  function write(file,value){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value),{mode:0o600});fs.renameSync(temp,file);}
  const clipFile=id=>path.join(root,'clips',id+'.mp3');
  const latestFile=id=>path.join(root,'latest',id+'.json');
  function validBundle(bundle){return bundle&&bundle.manifest?.profile===profileId&&bundle.manifest.entries.every(e=>/^[a-f0-9]{64}$/.test(e.hash)&&fs.existsSync(clipFile(e.hash))&&fs.statSync(clipFile(e.hash)).size===e.bytes);}
  function promote(job){
    if(current(job.script.courseId)?.revision===job.script.revision)write(latestFile(job.script.courseId),job.bundle);
  }
  async function clip(item){
    const key=hash(profileId+'\n'+Speech.lookup(item.text,item.voice));
    if(inflight.has(key))return inflight.get(key);
    const task=(async()=>{
      const metadata=path.join(root,'index',key+'.json'),saved=read(metadata);
      if(saved&&/^[a-f0-9]{64}$/.test(saved.hash)&&fs.existsSync(clipFile(saved.hash))&&fs.statSync(clipFile(saved.hash)).size===saved.bytes)return saved;
      let failure;
      for(let attempt=0;attempt<3;attempt++){
        try{
          const audio=await synthesize(item);
          if(!Buffer.isBuffer(audio)||audio.length<128||!(audio.toString('ascii',0,3)==='ID3'||audio[0]===255&&(audio[1]&224)===224))throw Error('Invalid MP3 from speech service');
          const id=hash(audio),file=clipFile(id);
          if(!fs.existsSync(file)){fs.writeFileSync(file+'.tmp',audio,{mode:0o600});fs.renameSync(file+'.tmp',file);}
          const result={hash:id,bytes:audio.length};write(metadata,result);return result;
        }catch(error){failure=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,retryDelay*(attempt+1)));}
      }
      throw failure;
    })();
    inflight.set(key,task);
    try{return await task;}finally{inflight.delete(key);}
  }
  function publicStatus(job){
    return {courseId:job.script.courseId,revision:job.script.revision,state:job.state,done:job.done,total:job.total,error:job.error||null,readyRevision:read(latestFile(job.script.courseId))?.script?.revision??null};
  }
  async function processQueue(){
    if(running)return;running=true;
    try{
      while(queue.length){
        const job=queue.shift();job.state='generating';
        const entries=new Array(job.items.length);let cursor=0,failure=null;
        async function worker(){
          while(cursor<job.items.length&&!failure){
            const i=cursor++,item=job.items[i];
            try{const result=await clip(item);entries[i]={...item,...result,url:'api/course-audio/clips/'+result.hash+'.mp3'};job.done++;}
            catch(error){failure=error;}
          }
        }
        await Promise.all(Array.from({length:Math.max(1,Math.min(4,concurrency))},worker));
        if(failure){job.state='failed';job.error='音频生成失败，请检查语音服务后重新保存课程。';console.error('[course-audio]',job.script.courseId,failure.message);continue;}
        job.bundle={script:job.script,manifest:{id:job.id,profile:profileId,courseId:job.script.courseId,revision:job.script.revision,bytes:entries.reduce((n,e)=>n+e.bytes,0),entries}};
        write(path.join(root,'manifests',job.id+'.json'),job.bundle);
        job.state='ready';promote(job);
      }
    }finally{running=false;}
  }
  function ensure(course){
    const script=copy(course),id=hash(profileId+'\n'+JSON.stringify(script));
    if(jobs.has(id))return jobs.get(id);
    const items=Speech.enumerate(script),bundle=read(path.join(root,'manifests',id+'.json'));
    const ready=validBundle(bundle);
    const job={id,script,items,bundle:ready?bundle:null,state:ready?'ready':'queued',total:items.length,done:ready?items.length:0};jobs.set(id,job);
    if(ready)promote(job);else{queue.push(job);void processQueue();}
    return job;
  }
  function playback(course,preview=false){
    const job=ensure(course);
    if(job.state==='ready')return {ready:true,bundle:job.bundle,status:publicStatus(job)};
    const previous=read(latestFile(course.courseId));
    if(!preview&&validBundle(previous))return {ready:true,bundle:previous,status:publicStatus(job)};
    return {ready:false,status:publicStatus(job)};
  }
  function serveClip(req,res,id){
    const file=clipFile(id);if(!fs.existsSync(file)){res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"Audio not found"}');return;}
    const size=fs.statSync(file).size,headers={'Content-Type':'audio/mpeg','Cache-Control':'public, max-age=31536000, immutable','Accept-Ranges':'bytes','ETag':'"'+id+'"'};
    let start=0,end=size-1,status=200;
    if(req.headers.range){
      const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(!m||!m[1]&&!m[2]){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}
      if(!m[1])start=Math.max(0,size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
      if(start>=size||start>end){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}
      status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+size;
    }
    headers['Content-Length']=end-start+1;res.writeHead(status,headers);
    if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
  }
  return {ensure,playback,status:course=>publicStatus(ensure(course)),serveClip};
};
