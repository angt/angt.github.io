const CACHE = "secret-shell-v9";
const DATA_CACHE = "secret-data-v1";
const DATA = [
  "https://raw.githubusercontent.com/angt/secret/master/secret.wasm",
  "https://raw.githubusercontent.com/angt/dotfiles/master/.secret",
];
const SHELL = [
  "./index.html",
  "./app.js?v=9",
  "./logo.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./manifest.webmanifest",
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const [shell, data] = await Promise.all([
      caches.open(CACHE),
      caches.open(DATA_CACHE),
    ]);
    await Promise.all([shell.addAll(SHELL), data.addAll(DATA)]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => (key.startsWith("secret-shell-") && key !== CACHE) ||
        (key.startsWith("secret-data-") && key !== DATA_CACHE))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (DATA.includes(request.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      const cached = await cache.match(request);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put("./index.html", response.clone());
        }
        return response;
      } catch {
        return (await caches.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
