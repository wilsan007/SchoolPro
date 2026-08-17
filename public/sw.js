// EcolPro — Service Worker v6
// Caching stratégies pour offline + push notifications

const CACHE_VERSION = "ecolpro-v6";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Ressources statiques à pré-cacher
const PRECACHE_URLS = [
  "/",
  "/dashboard",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// --- Installation : pré-cache des assets critiques ---
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

// --- Activation : nettoyage des anciens caches ---
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name.startsWith("ecolpro-") && name !== CACHE_VERSION && !name.includes(CACHE_VERSION))
          .map((name) => caches.delete(name))
      )
    ).then(() => clients.claim())
  );
});

// --- Fetch : stratégies par type de ressource ---
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non GET
  if (request.method !== "GET") return;

  // Ignorer les requêtes d'authentification et API POST
  if (url.pathname.startsWith("/api/auth") || url.pathname.includes("/auth/")) return;

  // Strategy 1: Network First pour les pages HTML et API
  if (request.mode === "navigate" || url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cloner et mettre en cache si valide
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // Offline: essayer le cache, puis page offline
          return caches.match(request).then((cached) => {
            return cached || caches.match("/dashboard");
          });
        })
    );
    return;
  }

  // Strategy 2: Cache First pour les assets statiques (CSS, JS, images, fonts)
  if (
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "image" ||
    request.destination === "font" ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, responseClone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Strategy 3: Stale While Revalidate pour les autres ressources
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// --- Push notifications ---
self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body ?? "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-72x72.png",
    tag: data.tag ?? "ecolpro-notif",
    data: { url: data.url ?? "/dashboard" },
    actions: [
      { action: "open", title: "Ouvrir" },
      { action: "dismiss", title: "Ignorer" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title ?? "EcolPro", options)
  );
});

// --- Clic sur notification push ---
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const url = event.notification.data?.url ?? "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// --- Message depuis le client (skip waiting) ---
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
