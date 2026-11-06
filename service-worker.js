const CACHE_NAME = "elit-home-stok-v13-vat";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/weltew-stock.js",
  "./js/weltew-import.js?v=12",
  "./css/weltew-stock.css",
  "./css/brand.css",
  "./icons/elit-home-logo.png",
  "./icons/elit-app-192.png",
  "./icons/elit-app-512.png",
  "./icons/elit-app-maskable.png",
  "./icons/elit-app-apple.png",
  "./icons/weltew-logo.png",
  "./icons/weltew-logo-white.png",
  "./js/firebase-config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Firebase / Google API çağrılarına dokunma — her zaman ağdan gitsin.
  if (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("firebaseapp.com")
  ) {
    return;
  }

  // Sadece kendi origin'imizdeki GET isteklerini önbellekle (app shell).
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
