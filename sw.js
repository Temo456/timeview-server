// 缓存键：与 server.js 的 VERSION 同步 bump，否则老用户会被 SW 缓存挡住看不到新页面
const CACHE_PREFIX = "timeview:" + self.registration.scope + ":v";
const C = CACHE_PREFIX + "4.2.13";
// The loading coordinator owns complete movies in this disk cache. Serve them
// through an ordinary URL so Safari's media process need not decode Blob URLs.
const MOVIE_CACHE='timeview-preload:'+self.registration.scope+':4.0.19';
async function movieResponse(req){
  const cache=await caches.open(MOVIE_CACHE);
  const cached=await cache.match(req.url);
  if(!cached||cached.status!==200)return fetch(req);
  const headers=new Headers(cached.headers);headers.set('Accept-Ranges','bytes');headers.set('X-Timeview-Media-Cache','hit');
  const range=req.headers.get('range');
  if(!range)return new Response(req.method==='HEAD'?null:cached.body,{status:200,headers});
  const match=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if(!match||(!match[1]&&!match[2]))return fetch(req);
  const blob=await cached.blob(),size=blob.size;
  const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  const end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start> end||start>=size){
    return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size,'Accept-Ranges':'bytes'}});
  }
  headers.set('Content-Range',`bytes ${start}-${end}/${size}`);headers.set('Content-Length',String(end-start+1));
  return new Response(req.method==='HEAD'?null:blob.slice(start,end+1),{status:206,headers});
}
self.addEventListener('message',e=>{
  if(e.data?.type==='timeview:movie-cache')e.ports[0]?.postMessage({movieCache:true});
});
self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(["./","app","manifest.json","icon-192.png","icon-512.png"]).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith(CACHE_PREFIX) && k !== C).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET"&&req.method !== "HEAD") return;
  if (req.url.indexOf("/api/") >= 0) return;
  if (!req.url.startsWith("http")) return;
  const local=req.url.startsWith(self.registration.scope)?req.url.slice(self.registration.scope.length).split('?')[0]:'';
  if(/^textures\/intro-(beijing|shanghai)-v\d+(?:-mobile)?\.mp4$/.test(local)){
    e.respondWith(movieResponse(req).catch(()=>fetch(req)));return;
  }
  if(req.method!=='GET')return;
  // 媒体由浏览器直接处理 Range / 206，避免缓存整段响应破坏拖动和重播。
  if (req.headers.has("range") || req.destination === "video" || req.destination === "audio" ||
      /\.(mp4|webm|mp3|wav)$/i.test(new URL(req.url).pathname)) return;
  // 本地开发不缓存，直接走网络
  if (req.url.indexOf("localhost") >= 0 || req.url.indexOf("127.0.0.1") >= 0) return;
  async function fromNetwork() {
    const resp = await fetch(req);
    // 即使请求未带 Range，服务端也可能返回 206；只缓存完整成功响应。
    if (resp.status === 200 && resp.type !== "opaque") {
      const cp = resp.clone();
      e.waitUntil(caches.open(C).then(c => c.put(req, cp)).catch(() => {}));
    }
    return resp;
  }
  e.respondWith((async () => {
    const cache = await caches.open(C);
    // 页面优先联网，避免旧 HTML 一直命中缓存、无法载入新的播放逻辑。
    if (req.mode === "navigate") {
      try { return await fromNetwork(); }
      catch (_) { return (await cache.match(req)) || (await cache.match("app")) || Response.error(); }
    }
    return (await cache.match(req)) || fromNetwork();
  })());
});
