// Service worker of the browser-only build: keeps a copy of the whole site, so after the first
// visit the teletype also works offline and can be installed as an app (manifest.webmanifest).
//
// web/build.sh fills in VERSION (a hash of the site's files) and FILES. A new build means a new
// VERSION: the browser notices the changed sw.js, downloads the new files in the background and
// switches over; the open page keeps running and gets the new version on its next load.
// The saved disk is in IndexedDB, not in this cache, so updates never touch it.
const VERSION = "__VERSION__";
const FILES = __FILES__;
const PREFIX = "pdp7-teletype-", CACHE = PREFIX + VERSION;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map((f) => new Request(f, { cache: "reload" })));    // skip the HTTP cache
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// cache first; the network only for what is not in the cache
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true })
             || (req.mode === "navigate" ? await cache.match("index.html") : undefined);
    return hit || fetch(req);
  })());
});
