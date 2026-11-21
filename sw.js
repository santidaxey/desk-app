// minimal SW: cache the shell; data JSON always from network (no web push in plan B)
const C="desk-v1";self.addEventListener("install",e=>e.waitUntil(caches.open(C).then(c=>c.addAll(["./","index.html","app.css","app.js","chart.js"]))));
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(u.pathname.includes("/d/"))return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))});
