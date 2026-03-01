const CACHE = "dime-lite-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./sw.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(resp => {
        // cache new GET requests
        if(event.request.method === "GET"){
          const copy = resp.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return resp;
      }).catch(() => cached)
    )
  );
});
