const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const Speech=require('../course-speech'),create=require('../course-audio'),base=require('../course-default.json');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const wait=async job=>{for(let i=0;i<500&&!['ready','failed'].includes(job.state);i++)await new Promise(r=>setTimeout(r,10));assert.equal(job.state,'ready');return job;};
(async()=>{
  const template=base.templates.date;
  assert.equal(Speech.spoken('农历廿、廿三、廿六、二十、卅；星宿'),'农历二十、二十三、二十六、二十、三十；星秀');
  for(const [input,expected] of [
    [{date:'2026-09-29'},'二零二六年九月二十九日'],
    [{date:'2000-02-29',defaultTime:false,time:'15:05'},'二零零零年二月二十九日，采用北京时间十五点零五分。'],
    [{date:'1998-12-20',defaultTime:false,time:'00:00'},'一九九八年十二月二十日，采用北京时间零点整。'],
    [{date:'2100-12-31',defaultTime:false,time:'23:59'},'二一零零年十二月三十一日，采用北京时间二十三点五十九分。']
  ]){
    const plan=Speech.datePlan(template,input);assert.equal(plan.parts.length,1);assert(plan.parts[0].includes(expected),plan.parts[0]);assert(plan.text.includes(input.date));
  }
  for(const date of ['2025-02-29','2100-02-29','2026-04-31','1899-12-31','2101-01-01','2026-1-1','../../etc/passwd'])assert.throws(()=>Speech.datePlan(template,{date}));
  for(const time of ['24:00','15:60','-1:00','1:00'])assert.throws(()=>Speech.datePlan(template,{date:'2000-01-01',time,defaultTime:false}));
  assert.throws(()=>Speech.datePlan(template,{date:'2000-01-01',example:'false'}));
  assert(Speech.datePlan(template,{date:'2000-01-01',example:true}).parts[0].startsWith('我们用一个演示日期，'));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tv-whole-date-')),calls=[];let current=structuredClone(base),fail=false;
  // Storage test fixture; actual decoding is checked separately against generated MP3s.
  const opts={dataDir:dir,profile:['test'],current:()=>current,retryDelay:1,synthesize:async item=>{calls.push(item);if(fail)throw Error('unavailable');await new Promise(r=>setTimeout(r,1));return Buffer.concat([Buffer.from('ID3'),Buffer.alloc(128),Buffer.from(item.text)]);}};
  try{
    const audio=create(opts),first=await wait(audio.ensure(current)),items=Speech.enumerate(current);
    assert.equal(first.bundle.manifest.speechVersion,Speech.VERSION);assert.equal(calls.length,items.length);
    assert(items.some(e=>e.text.includes('二十三前后')));assert(!items.some(e=>/[廿卅]/.test(e.text)));
    const date={date:'1998-12-20',time:'15:05',defaultTime:false},before=calls.length;
    const [a,b]=await Promise.all([audio.dateAudio(first.id,date),audio.dateAudio(first.id,date)]);
    assert.deepEqual(a,b);assert.equal(calls.length,before+1);assert.equal(calls.at(-1).voice,'female');assert(calls.at(-1).text.includes('十二月二十日，采用北京时间十五点零五分。'));
    assert.deepEqual(await create(opts).dateAudio(first.id,date),a);assert.equal(calls.length,before+1,'Restart must reuse whole utterance');
    const fallback=current.lines.find(r=>r.type==='date').fallback;
    await audio.dateAudio(first.id,{date:fallback,example:true});assert.equal(calls.length,before+1,'Fallback is preloaded');
    await assert.rejects(audio.dateAudio('../x',date),e=>e.status===400);
    await assert.rejects(audio.dateAudio('0'.repeat(64),date),e=>e.status===409);
    await assert.rejects(audio.dateAudio(first.id,{date:'2025-02-29'}),e=>e.status===400);
    const old=structuredClone(first.bundle);delete old.manifest.speechVersion;
    fs.writeFileSync(path.join(dir,'course-audio/manifests',old.manifest.id+'.json'),JSON.stringify(old));
    await assert.rejects(audio.dateAudio(first.id,date),e=>e.status===409);
    fs.writeFileSync(path.join(dir,'course-audio/manifests',first.id+'.json'),JSON.stringify(first.bundle));
    current=structuredClone(current);current.revision++;
    current.templates.date='确认：'+template;
    const second=await wait(audio.ensure(current));
    assert.deepEqual(await audio.dateAudio(first.id,date),a,'Existing page keeps its course snapshot');
    const updated=await audio.dateAudio(second.id,date);assert(updated.entry.text.startsWith('确认：'));assert.notEqual(updated.entry.hash,a.entry.hash);
    // A v1 index for unchanged text still works with the new speech planner.
    const e=first.bundle.manifest.entries.find(e=>!e.text.includes('日期')),profile=sha(JSON.stringify({profile:['test'],format:'mp3',speech:1}));
    assert(fs.existsSync(path.join(dir,'course-audio/index',sha(profile+'\n'+Speech.lookup(e.text,e.voice))+'.json')));
    fail=true;await assert.rejects(audio.dateAudio(second.id,{date:'1980-01-02'}));fail=false;
    await audio.dateAudio(second.id,{date:'1980-01-02'});
    console.log('PASS natural date/time, lunar pronunciation, strict date validation, whole-utterance synthesis, concurrent deduplication, restart/fallback reuse, snapshot isolation, old manifest rejection and retry');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
