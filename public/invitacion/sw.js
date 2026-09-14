// Pasaporte de Boda — Nati & Leo — Service Worker
// Cachea el "cascarón" estático (HTML/CSS/JS/íconos propios) para que la app
// abra rápido e instalada como PWA. Los datos (Supabase) siempre van por red:
// este SW nunca intercepta peticiones a otros orígenes.

const CACHE_VERSION = "pasaporte-shell-v17";

const SHELL_FILES = [
  "./index.html",
  "./pasaporte.html",
  "./galeria.html",
  "./album.html",
  "./manifest.json",
  "../assets/css/tokens.css",
  "../assets/css/base.css",
  "../assets/css/components.css",
  "../assets/css/passport.css",
  "../assets/css/gallery.css",
  "../assets/css/album.css",
  "../assets/js/entry.js",
  "../assets/js/passport.js",
  "../assets/js/vendor/page-flip.module.js",
  "../assets/js/gallery.js",
  "../assets/js/album.js",
  "../assets/js/supabase-client.js",
  "../assets/img/cover-pasaporte.png",
  "../assets/img/page-bg.png",
  "../icons/icon-192.png",
  "../icons/icon-512.png",
  "../icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo el mismo origen y solo GET — todo lo demás (Supabase, POST, etc.) pasa directo a la red.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Network-first para HTML (para que los cambios se vean sin esperar), con
  // respaldo a caché si no hay conexión. Cache-first para el resto del cascarón.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
    )
  );
});
