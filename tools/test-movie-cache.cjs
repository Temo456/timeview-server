const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{test}=require('node:test');
const script=fs.readFileSync(require('node:path').join(__dirname,'../sw.js'),'utf8');
function fixture(){
 const handlers={},scope='https://test.local/timeview-test/',url=scope+'textures/intro-beijing-v421-mobile.mp4';
 let network=0,complete=new Response(new Uint8Array([0,1,2,3,4,5,6,7,8,9]),{headers:{'Content-Type':'video/mp4','Content-Length':'10'}});
 vm.runInNewContext(script,{self:{registration:{scope},addEventListener:(name,fn)=>{handlers[name]=fn;}},
  caches:{open:async name=>{assert.equal(name,'timeview-preload:'+scope+':4.0.19');return {match:async path=>path===url?complete?.clone():null};}},
  Headers,Response,Number,fetch:async()=>{network++;return new Response('network');}});
 async function request(range,href=url,method='GET'){let response;handlers.fetch({request:new Request(href,{method,headers:range?{Range:range}: {}}),respondWith:p=>{response=p;}});return response;}
 return {request,url,scope,evict:()=>{complete=null;},network:()=>network};
}
test('complete, bounded, open-ended and suffix reads come from the same cached file',async()=>{
 const f=fixture();
 for(const [range,status,expected,contentRange] of [[null,200,[0,1,2,3,4,5,6,7,8,9],null],['bytes=0-1',206,[0,1],'bytes 0-1/10'],['bytes=7-',206,[7,8,9],'bytes 7-9/10'],['bytes=-3',206,[7,8,9],'bytes 7-9/10'],['bytes=8-99',206,[8,9],'bytes 8-9/10']]){
  const r=await f.request(range);assert.equal(r.status,status);assert.equal(r.headers.get('Content-Range'),contentRange);
  assert.equal(r.headers.get('Accept-Ranges'),'bytes');assert.equal(r.headers.get('Content-Type'),'video/mp4');
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],expected);assert.equal(r.headers.get('Content-Length'),String(expected.length));
 }
 assert.equal(f.network(),0);
});
test('unsatisfiable reads are 416 and never cache or return a partial file as complete',async()=>{
 const f=fixture();for(const range of ['bytes=10-','bytes=9-4','bytes=-0']){
  const r=await f.request(range);assert.equal(r.status,416);assert.equal(r.headers.get('Content-Range'),'bytes */10');
 }
 assert.equal((await f.request()).status,200);assert.equal(f.network(),0);
});
test('HEAD metadata reads are answered from cache without returning a body',async()=>{
 const f=fixture(),r=await f.request(null,f.url,'HEAD');assert.equal(r.status,200);assert.equal(r.headers.get('Content-Length'),'10');assert.equal(await r.text(),'');assert.equal(f.network(),0);
});
test('a cache miss falls back to the media server; another deployment is outside this worker scope',async()=>{
 const f=fixture();f.evict();assert.equal(await (await f.request('bytes=0-1')).text(),'network');assert.equal(f.network(),1);
 assert.equal(await f.request('bytes=0-1',f.url.replace('timeview-test/','timeview/')),undefined);
});
