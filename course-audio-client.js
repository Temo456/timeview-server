/* Course text and its immutable audio manifest travel together. */
(function(){
  'use strict';
  const Speech=window.TimeviewSpeech,scope=new URL('./',document.baseURI).href;
  const cacheName='timeview-course-audio:'+scope+':v1';
  const store=('caches' in window?caches.open(cacheName):Promise.resolve(null)).catch(()=>null);
  const blobs=new Map(),decoded=new Map(),dateRequests=new Map();
  let lessonPromise,preparePromise,bundle,index,context;
  const absolute=url=>new URL(url,document.baseURI).href;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function notify(status){window.dispatchEvent(new CustomEvent('timeview:audio-status',{detail:status}));}
  function validEntry(e){return e&&/^[a-f0-9]{64}$/.test(e.hash)&&e.bytes>0&&e.url==='api/course-audio/clips/'+e.hash+'.mp3';}
  function validBundle(value){return value?.script?.schemaVersion===2&&value.script.chapters?.length&&value.script.lines?.length&&value.manifest?.speechVersion===Speech.VERSION&&value.manifest?.entries?.length&&value.script.courseId===value.manifest.courseId&&value.script.revision===value.manifest.revision&&value.manifest.entries.every(validEntry);}
  function lesson(){
    if(lessonPromise)return lessonPromise;
    lessonPromise=(async()=>{
      const params=new URLSearchParams(location.search),query=new URLSearchParams();
      if(params.get('preview')==='1'){query.set('preview','1');if(params.get('course'))query.set('course',params.get('course'));}
      const url=absolute('api/course-playback'+(query.size?'?'+query:'')),cache=await store;
      for(;;){
        let response;
        try{response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});}
        catch(error){response=cache&&await cache.match(url);if(!response)throw Error('课程未能加载，请检查网络后重试。');}
        const data=await response.json();
        if(response.status===202){notify(data);await sleep(2500);continue;}
        if(!response.ok||!validBundle(data))throw Error(data.error||'课程音频尚未准备好，请稍后重试。');
        bundle=data;index=new Map(data.manifest.entries.map(e=>[Speech.lookup(e.text,e.voice),e]));
        if(cache)await cache.put(url,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})).catch(()=>{});
        notify({state:'ready'});return data;
      }
    })();
    lessonPromise.catch(()=>{});return lessonPromise;
  }
  async function validAudio(blob,entry){
    if(blob.size!==entry.bytes)return false;
    if(!crypto.subtle)return true;
    const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')===entry.hash;
  }
  async function load(entry,progress){
    const url=absolute(entry.url),cache=await store;
    let response=cache&&await cache.match(url).catch(()=>null);
    if(response){
      const blob=await response.blob();
      if(await validAudio(blob,entry)){blobs.set(entry.hash,blob);progress(url,entry.bytes,entry.bytes);return;}
      await cache.delete(url).catch(()=>{});
    }
    const controller=new AbortController();let timer;
    // Audio can wait behind the two intro movies in the browser's request queue.
    const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),90000);};
    try{
      arm();response=await fetch(url,{signal:controller.signal});
      if(!response.ok||!/^audio\//.test(response.headers.get('Content-Type')||''))throw Error('Invalid audio');
      const chunks=[];let bytes=0;
      if(response.body){
        const reader=response.body.getReader();
        for(;;){arm();const {done,value}=await reader.read();if(done)break;chunks.push(value);bytes+=value.byteLength;progress(url,bytes,entry.bytes);}
      }else{const data=await response.arrayBuffer();chunks.push(data);bytes=data.byteLength;}
      const blob=new Blob(chunks,{type:'audio/mpeg'});
      if(!await validAudio(blob,entry))throw Error('Incomplete audio');
      blobs.set(entry.hash,blob);
      if(cache)await cache.put(url,new Response(blob,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(blob.size)}})).catch(()=>{});
      progress(url,bytes,entry.bytes);
    }catch(error){throw Error('朗读音频未能完整加载，请检查网络后重试。');}
    finally{clearTimeout(timer);}
  }
  function prepare({register=()=>{},progress=()=>{}}={}){
    if(preparePromise)return preparePromise;
    preparePromise=(async()=>{
      const {manifest}=await lesson(),entries=[...new Map(manifest.entries.map(e=>[e.hash,e])).values()];
      register(entries);
      let cursor=0;
      await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{
        while(cursor<entries.length){
          const entry=entries[cursor++];
          try{await load(entry,progress);}
          catch(error){await sleep(500);await load(entry,progress);}
        }
      }));
      return manifest;
    })();
    preparePromise.catch(()=>{});return preparePromise;
  }
  async function pcm(entry){
    if(decoded.has(entry.hash))return decoded.get(entry.hash);
    if(!context)context=new (window.AudioContext||window.webkitAudioContext)();
    const promise=(async()=>{
      const buffer=await context.decodeAudioData(await blobs.get(entry.hash).arrayBuffer());
      const samples=new Float32Array(buffer.length);
      for(let channel=0;channel<buffer.numberOfChannels;channel++){
        const data=buffer.getChannelData(channel);for(let i=0;i<samples.length;i++)samples[i]+=data[i]/buffer.numberOfChannels;
      }
      // Remove the provider's padding between prerecorded number/word units.
      const keep=Math.round(buffer.sampleRate*.025),limit=Math.round(buffer.sampleRate*.65);
      let start=0,end=samples.length;
      while(start<Math.min(limit,end)&&Math.abs(samples[start])<.004)start++;
      while(end>Math.max(start,samples.length-limit)&&Math.abs(samples[end-1])<.004)end--;
      return {samples:samples.slice(Math.max(0,start-keep),Math.min(samples.length,end+keep)),rate:buffer.sampleRate};
    })();
    decoded.set(entry.hash,promise);
    if(decoded.size>96)decoded.delete(decoded.keys().next().value);
    try{return await promise;}catch(error){decoded.delete(entry.hash);throw error;}
  }
  async function cachedUtterance(text,voice,route,payload,cacheRoute){
    const key=Speech.lookup(text,voice);
    const savedEntry=index.get(key);
    if(savedEntry&&blobs.has(savedEntry.hash))return blobs.get(savedEntry.hash);
    const url=absolute(cacheRoute+'/'+bundle.manifest.profile+'/'+Speech.VERSION+'?voice='+voice+'&text='+encodeURIComponent(text));
    if(dateRequests.has(url))return dateRequests.get(url);
    const promise=(async()=>{
      const cache=await store,cached=cache&&await cache.match(url).catch(()=>null);
      let entry=cached&&await cached.json().catch(()=>null);
      const matches=e=>validEntry(e)&&e.voice===voice&&e.text===text;
      if(!matches(entry)){
        const response=await fetch(absolute(route),{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({manifestId:bundle.manifest.id,...payload}),signal:AbortSignal.timeout(210000)});
        if(!response.ok)throw Error('讲解语音暂未准备好');
        entry=(await response.json()).entry;
        if(!matches(entry))throw Error('讲解语音与台词不一致');
      }
      if(!blobs.has(entry.hash))await load(entry,()=>{});
      if(cache)await cache.put(url,new Response(JSON.stringify(entry),{headers:{'Content-Type':'application/json'}})).catch(()=>{});
      index.set(key,entry);return blobs.get(entry.hash);
    })();
    dateRequests.set(url,promise);
    try{return await promise;}finally{dateRequests.delete(url);}
  }
  async function dateAudio(input){
    await prepare();const plan=Speech.datePlan(bundle.script.templates?.date,input);
    return cachedUtterance(plan.parts[0],'female','api/course-date-audio',{date:plan.request},'api/course-date-cache');
  }
  async function dynamicAudio(request){
    await prepare();const {template,voice}=Speech.dynamicSource(bundle.script,request),plan=Speech.dynamicPlan(template,request.values,request);
    if(!Number.isInteger(request.segment)||!plan[request.segment])throw Error('语音段落编号无效');
    return cachedUtterance(plan[request.segment].parts[0],voice,'api/course-dynamic-audio',{request:plan[request.segment].request},'api/course-dynamic-cache');
  }
  async function prepareDynamic(source,values){
    await prepare();const {template}=Speech.dynamicSource(bundle.script,source);
    return Promise.all(Speech.dynamicPlan(template,values,source).map(segment=>dynamicAudio(segment.request)));
  }
  async function audio(parts,voice,request){
    if(request)return request.kind?dynamicAudio(request):dateAudio(request);
    await prepare();
    const entries=parts.map(text=>{const entry=index.get(Speech.lookup(text,voice));if(!entry)throw Error('课程语音与台词不一致');return entry;});
    if(entries.length===1)return blobs.get(entries[0].hash);
    const pieces=await Promise.all(entries.map(pcm)),rate=pieces[0].rate;
    const count=pieces.reduce((n,p)=>n+p.samples.length,0),bytes=new ArrayBuffer(44+count*2),view=new DataView(bytes);
    const label=(offset,text)=>Array.from(text).forEach((ch,i)=>view.setUint8(offset+i,ch.charCodeAt(0)));
    label(0,'RIFF');view.setUint32(4,36+count*2,true);label(8,'WAVE');label(12,'fmt ');view.setUint32(16,16,true);
    view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);
    view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,count*2,true);
    let at=44;for(const piece of pieces)for(const sample of piece.samples){view.setInt16(at,Math.round(Math.max(-1,Math.min(1,sample))*32767),true);at+=2;}
    return new Blob([bytes],{type:'audio/wav'});
  }
  window.TimeviewAudio={lesson,prepare,audio,dateAudio,prepareDynamic};
})();
