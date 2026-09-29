const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Speech=require('../course-speech'),create=require('../course-audio'),base=require('../course-default.json');
const wait=async job=>{for(let i=0;i<500&&!['ready','failed'].includes(job.state);i++)await new Promise(r=>setTimeout(r,10));assert.equal(job.state,'ready');return job;};
(async()=>{
 const template='这一天的月相是{{月相}}，照亮比例约百分之{{照亮比例}}。报告已经放在下面。';
 for(const n of [0,1,9,10,20,50,99,100]){
  const plan=Speech.dynamicPlan(template,{'月相':'满月','照亮比例':n},{kind:'report'});
  assert.equal(plan[0].parts.length,1);assert.equal(plan[0].parts[0],'这一天的月相是满月，照亮比例约百分之'+Speech.number(n).join('')+'。');assert(plan[0].text.includes(String(n)));
 }
 const cities={'城市时间':'北京是9月29日 15:05，伦敦是9月29日 08:05，纽约是9月29日 00:00'};
 const line=base.lines.find(l=>l.text?.includes('{{城市时间}}'));
 const cityPlan=Speech.dynamicPlan(line.text,cities,{kind:'line',lineId:line.id}),citySegment=cityPlan.find(p=>p.text.includes('北京是'));
 assert.equal(citySegment.parts.length,1);assert(citySegment.parts[0].includes('北京是九月二十九日十五点零五分，伦敦是九月二十九日八点零五分，纽约是九月二十九日零点整'));
 assert(Speech.dynamicPlan('{{城市时间}}',{'城市时间':cities['城市时间'].replace('00:00','24:00')},{kind:'line'})[0].parts[0].endsWith('零点整'));
 const long=Speech.dynamicPlan('天'.repeat(78)+'{{月相}}，照亮百分之{{照亮比例}}。',{'月相':'满月','照亮比例':99},{kind:'report'});assert(!JSON.stringify(long.map(p=>p.parts)).includes('{{'));
 for(const n of [-1,101,1.2,'99',null])assert.throws(()=>Speech.dynamicPlan(template,{'月相':'满月','照亮比例':n},{kind:'report'}));
 for(const text of ['北京是9月29日 15:05','北京是13月29日 15:05，伦敦是9月29日 08:05，纽约是9月29日 00:00',cities['城市时间'].replace('00:00','24:01'),cities['城市时间']+'任意文字'])assert.throws(()=>Speech.dynamicPlan(line.text,{'城市时间':text},{kind:'line'}));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tv-dynamic-')),calls=[];let current=structuredClone(base),fail=false;
 for(const row of current.lines)if(['date','example'].includes(row.type))row.birthday=row.chapter>=9;
 current.templates.report=template;
 const opts={dataDir:dir,profile:['test'],current:()=>current,reportForDate:()=>({'月相':'残月','照亮比例':20}),retryDelay:1,synthesize:async item=>{calls.push(item);if(fail)throw Error('unavailable');await new Promise(r=>setTimeout(r,1));return Buffer.concat([Buffer.from('ID3'),Buffer.alloc(128),Buffer.from(item.text)]);}};
 try{
  const audio=create(opts),first=await wait(audio.ensure(current));assert.equal(first.bundle.manifest.speechVersion,3);
  assert(first.bundle.manifest.entries.some(e=>e.text==='这一天的月相是残月，照亮比例约百分之二十。'));
  const request={kind:'report',values:{'月相':'满月','照亮比例':99},segment:0},before=calls.length;
  const [a,b]=await Promise.all([audio.dynamicAudio(first.id,request),audio.dynamicAudio(first.id,request)]);
  assert.deepEqual(a,b);assert.equal(calls.length,before+1);assert.equal(a.entry.text,'这一天的月相是满月，照亮比例约百分之九十九。');assert.equal(a.entry.voice,'male');
  assert.deepEqual(await create(opts).dynamicAudio(first.id,request),a);assert.equal(calls.length,before+1);
  await audio.dynamicAudio(first.id,{...request,values:{'月相':'残月','照亮比例':20}});assert.equal(calls.length,before+1,'Example reports are preloaded');
  const city=await audio.dynamicAudio(first.id,citySegment.request);assert.equal(city.entry.text,citySegment.parts[0]);assert.equal(city.entry.voice,'male');
  for(const bad of [{...request,segment:99},{...request,segment:'0'},{...request,kind:'custom'},{...request,values:{'月相':'任意文字','照亮比例':99}},{kind:'line',lineId:'absent',values:cities,segment:0}])await assert.rejects(audio.dynamicAudio(first.id,bad),e=>e.status===400);
  await assert.rejects(audio.dynamicAudio('../x',request),e=>e.status===400);await assert.rejects(audio.dynamicAudio('0'.repeat(64),request),e=>e.status===409);
  const old=structuredClone(first.bundle);old.manifest.speechVersion=2;const file=path.join(dir,'course-audio/manifests',first.id+'.json');fs.writeFileSync(file,JSON.stringify(old));await assert.rejects(audio.dynamicAudio(first.id,request),e=>e.status===409);fs.writeFileSync(file,JSON.stringify(first.bundle));
  current=structuredClone(current);current.revision++;current.templates.report='观察：'+template;current.lines.find(l=>l.id===line.id).role='axing';const second=await wait(audio.ensure(current));
  assert.deepEqual(await audio.dynamicAudio(first.id,request),a);const newer=await audio.dynamicAudio(second.id,request);assert(newer.entry.text.startsWith('观察：'));assert.notEqual(newer.entry.hash,a.entry.hash);
  const female=await audio.dynamicAudio(second.id,citySegment.request);assert.equal(female.entry.voice,'female','Voice follows the maintained course snapshot');
  fail=true;await assert.rejects(audio.dynamicAudio(second.id,{...request,values:{'月相':'新月','照亮比例':0}}));fail=false;await audio.dynamicAudio(second.id,{...request,values:{'月相':'新月','照亮比例':0}});
  console.log('PASS whole phase/percentage sentences, natural city times, preloaded examples, deduplication, restart reuse, role and course snapshots, strict inputs, old manifest rejection and retry');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
