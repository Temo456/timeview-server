// 缓存键：与 server.js 的 VERSION 同步 bump，否则老用户会被 SW 缓存挡住看不到新页面
const C = "timeview-v3.33";
self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(["./","app","manifest.json","icon-192.png","icon-512.png"]).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith("timeview-v") && k !== C).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.url.indexOf("/api/") >= 0) return;
  if (!req.url.startsWith("http")) return;
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
