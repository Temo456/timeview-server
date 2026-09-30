// Dependency-free regression checks for the actual browser loading coordinator.
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../preload.js'), 'utf8');

function fixture({apple = false, ipad = false, wechat = false, fail = false, slow = false, mediaMode='normal'} = {}) {
  let now = 0, nextTimer = 0, activeDecodes = 0, maxDecodes = 0, activeFetches = 0, maxFetches = 0;
  const timers = new Map(), elements = new Map(), decoded = [], fetched = [], revoked = [], cache = new Map();
  const target = new EventTarget();
  const el = id => {
    if (!elements.has(id)) elements.set(id, Object.assign(new EventTarget(), {
      dataset: {phase: 'loading', view: 'earth'}, style: {}, firstElementChild: {style: {}},
      removeAttribute() {}, setAttribute() {}, focus() {}, textContent: ''
    }));
    return elements.get(id);
  };
  let finishAudio;
  const audioBarrier = new Promise(resolve => { finishAudio = resolve; });
  class Img {
    constructor() { this.naturalWidth = 2048; }
    async decode() {
      decoded.push(this.src); activeDecodes++; maxDecodes = Math.max(maxDecodes, activeDecodes);
      await new Promise(setImmediate); activeDecodes--;
    }
  }
  const video = Object.assign(new EventTarget(), {style:{},setAttribute(){},readyState:0,videoWidth:0,networkState:1,error:null,loads:0,load() {
    this.loads++;
    this.error=null;
    if(mediaMode==='gesture')return;
    if(mediaMode==='error'||mediaMode==='blob-error'&&this.src.startsWith('blob:')){this.error={code:4};this.dispatchEvent(new Event('error'));return;}
    this.readyState=1;this.videoWidth=960;
    if(mediaMode!=='silent-ready')this.dispatchEvent(new Event('loadedmetadata'));
  }});
  const context = {
    navigator: {userAgent: (apple ? 'iPhone' : 'Desktop')+(wechat?' MicroMessenger/8.0':''), platform: ipad ? 'MacIntel' : '', maxTouchPoints: ipad ? 5 : 0},
    document: {baseURI: 'https://test.local/app', readyState: 'complete', getElementById: el},
    performance: {now: () => now},
    setTimeout: (fn, ms) => { timers.set(++nextTimer, {fn, at: now + ms}); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => queueMicrotask(fn),
    URL: class extends URL {
      static createObjectURL() { return 'blob:test/' + Math.random(); }
      static revokeObjectURL(url) { revoked.push(url); }
    },
    Image: Img, Blob, Response, AbortController, Event,
    caches: {keys: async () => [], open: async () => ({
      match: async url => cache.get(url)?.clone(),
      put: async (url, response) => { cache.set(url, response.clone()); },
      delete: async url => cache.delete(url)
    })},
    fetch: async url => {
      fetched.push(url); activeFetches++; maxFetches = Math.max(maxFetches, activeFetches);
      await new Promise(setImmediate); activeFetches--;
      if (fail && url.endsWith('moon.jpg')) throw Error('offline');
      return new Response('complete asset', {headers: {'Content-Type': url.endsWith('.mp4') ? 'video/mp4' : url.endsWith('.js') ? 'application/javascript' : 'image/webp'}});
    },
    addEventListener: target.addEventListener.bind(target), dispatchEvent: target.dispatchEvent.bind(target),
    TimeviewAssistantReady: Promise.resolve(), TimeviewCards: {}, TimeviewCourseVisuals: {},
    TimeviewAudio: {prepare: async ({register}) => { register([]); if (slow) await audioBarrier; }},
    location: {reload() { throw Error('Unexpected automatic reload'); }}
  };
  context.window = context;
  context.prepareEarthScene = () => Promise.all(['earth-north-pole.webp', 'moon.jpg', 'change-orbiter.svg?v=3.57'].map(file => context.TimeviewPreload.image(new Img(), 'textures/' + file)));
  vm.runInNewContext(source, context);
  const flush = async () => { for (let i = 0; i < 50; i++) await new Promise(setImmediate); };
  async function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    await flush();
  }
  const run = () => context.TimeviewPreload.prepare(video, 'intro.mp4', true, [
    {url: 'intro.mp4', bytes: 20, label: 'opening'}, {url: 'other.mp4', bytes: 20, label: 'other city'}
  ]);
  return {context, video, run, flush, advance, finishAudio, el, decoded, fetched, revoked, cache,
    counts: () => ({maxDecodes, maxFetches})};
}

test('fast load reaches 100% but cannot start before five seconds', async () => {
  const f = fixture(); let entered = false;
  const done = f.run().then(() => { entered = true; });
  await f.flush();
  assert.equal(f.el('introPercent').textContent, 100);
  await f.advance(4999); assert.equal(entered, false); assert.equal(f.context.TimeviewPreload.ready, false);
  await f.advance(1); await done; assert.equal(entered, true);
});

test('slow resources enter immediately on completion after the five-second floor', async () => {
  const f = fixture({slow: true}); let entered = false;
  const done = f.run().then(() => { entered = true; });
  await f.flush(); await f.advance(6500); assert.equal(entered, false);
  f.finishAudio(); await f.flush(); assert.equal(entered, true); await done;
});

for (const device of ['apple', 'ipad']) test(`${device}: metadata is enough once the complete movie is cached`, async () => {
  const f = fixture({[device]: true}); const done = f.run();
  await f.flush(); assert.equal(f.video.preload, 'metadata');
  await f.advance(5000); assert.equal(f.context.TimeviewPreload.ready, true); await done;
});

test('all resources cached, only active scene decoded, concurrency bounded, video buffers released', async () => {
  const f = fixture(); const done = f.run();
  await f.flush(); await f.advance(5000); await done;
  assert.equal(f.decoded.length, 3);
  assert.ok(f.counts().maxDecodes <= 2); assert.ok(f.counts().maxFetches <= 3);
  for (const file of ['textures/pluto.jpg', 'textures/earth-south-pole.webp', 'intro.mp4', 'other.mp4']) {
    assert.ok(f.cache.has('https://test.local/' + file), file);
  }
  f.context.TimeviewPreload.releaseMovies(); assert.equal(f.revoked.length, 2);
  assert.ok(f.cache.has('https://test.local/intro.mp4'), 'release keeps disk cache');
});

test('download failure stays on the loading error screen without entering or reloading', async () => {
  const f = fixture({fail: true});
  const done = f.run().catch(f.context.TimeviewPreload.fail);
  await f.flush(); await f.advance(6000); await done;
  assert.equal(f.context.TimeviewPreload.ready, false);
  assert.equal(f.el('introOverlay').dataset.phase, 'error');
  assert.equal(f.el('introRetry').hidden, false);
});

test('Apple uses the normal media URL instead of a Blob URL', async()=>{
  const f=fixture({apple:true,mediaMode:'blob-error'}),done=f.run();
  await f.flush();await f.advance(5000);await done;
  assert.equal(f.video.src,'https://test.local/intro.mp4');assert.equal(f.context.TimeviewPreload.media.transport,'http');
});

test('missing metadata without a media error offers a user gesture and keeps complete cached movies', async()=>{
  const f=fixture({apple:true,mediaMode:'gesture'}),done=f.run();
  await f.flush();await f.advance(8000);const result=await done;
  assert.equal(result.needsGesture,true);assert.equal(f.context.TimeviewPreload.ready,true);
  assert.equal(f.context.TimeviewPreload.media.state,'waiting-for-gesture');assert(f.cache.has('https://test.local/intro.mp4'));
});

test('readyState can complete preparation even if WebKit omits the metadata event', async()=>{
  const f=fixture({apple:true,mediaMode:'silent-ready'}),done=f.run();
  await f.flush();await f.advance(5000);assert.equal((await done).needsGesture,false);
});

test('a Blob decoder failure retries the same complete movie through HTTP', async()=>{
  const f=fixture({mediaMode:'blob-error'}),done=f.run();await f.flush();await f.advance(5000);
  assert.equal((await done).needsGesture,false);assert.equal(f.video.src,'https://test.local/intro.mp4');
  assert.equal(f.context.TimeviewPreload.media.attempts[0].code,4);
});

test('an unsupported video does not erase the cache or block the prepared Earth', async()=>{
  const f=fixture({apple:true,mediaMode:'error'}),done=f.run();await f.flush();await f.advance(5000);
  assert.equal((await done).videoError,true);assert.equal(f.context.TimeviewPreload.ready,true);
  assert(f.cache.has('https://test.local/intro.mp4'));assert.equal(f.context.TimeviewPreload.media.state,'failed');
});

test('WeChat finishes the resource barrier without decoding media before a tap',async()=>{
  const f=fixture({apple:true,wechat:true,mediaMode:'gesture'}),done=f.run();
  await f.flush();assert.equal(f.video.loads,0);assert.equal(f.video.preload,'none');
  await f.advance(5000);assert.equal((await done).needsGesture,true);
  assert.equal(f.context.TimeviewPreload.ready,true);assert.equal(f.context.TimeviewPreload.media.environment,'wechat');
  assert.equal(f.video.src,'https://test.local/intro.mp4');assert(f.cache.has('https://test.local/intro.mp4'));
});
