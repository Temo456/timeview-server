// 缓存键：与 server.js 的 VERSION 同步 bump，否则老用户会被 SW 缓存挡住看不到新页面
const C = "timeview-v3.32";
self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(["./","app","manifest.json","icon-192.png","icon-512.png"]).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))));
  self.clients.claim();
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
  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(resp => {
      try { const cp = resp.clone(); caches.open(C).then(c => c.put(req, cp)); } catch (_) {}
      return resp;
    }).catch(() => caches.match("app")))
  );
});
