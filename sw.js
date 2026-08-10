const C = "timeview-v2";
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
  if (!req.url.startsWith("http")) return; // 忽略 chrome-extension 等非 http 协议
  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(resp => {
      try { const cp = resp.clone(); caches.open(C).then(c => c.put(req, cp)); } catch (_) {}
      return resp;
    }).catch(() => caches.match("app")))
  );
});
