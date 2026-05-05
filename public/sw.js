/* TodoMerchandising — Service Worker
 *
 * - Cache-first para assets estáticos (build-id revvable)
 * - Stale-while-revalidate para /catalogo y fichas (mejor UX offline)
 * - Network-first para /api/* (datos siempre frescos cuando hay conexión)
 * - Web Push: muestra notificación al recibir mensaje del backend admin
 *
 * Versionado mediante CACHE_VERSION; bumpear al cambiar la estrategia.
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const APP_SHELL = [
  "/",
  "/catalogo",
  "/manifest.json",
  "/icon.svg",
  "/logo-mark.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {
        // si algún recurso del shell falla, no abortamos la instalación
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => ![STATIC_CACHE, RUNTIME_CACHE].includes(n))
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Saltarse rutas privadas / auth
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/admin")) return;
  if (url.pathname.startsWith("/pay") || url.pathname.startsWith("/proof")) return;

  // network-first /api/*
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || Response.error())),
    );
    return;
  }

  // stale-while-revalidate para catálogo y fichas
  if (url.pathname.startsWith("/catalogo") || url.pathname === "/" || url.pathname.startsWith("/sectores")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkPromise = fetch(req)
          .then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
            }
            return res;
          })
          .catch(() => cached);
        return cached || networkPromise;
      }),
    );
    return;
  }
});

// Web Push
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "TodoMerchandising", body: event.data.text() };
  }
  const title = payload.title || "TodoMerchandising";
  const options = {
    body: payload.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: payload.url || "/admin" },
    tag: payload.tag || undefined,
    requireInteraction: payload.requireInteraction || false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
