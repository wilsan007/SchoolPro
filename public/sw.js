// EcolPro — Service Worker (PWA offline support)
const CACHE_NAME = "ecolpro-v3";
const STATIC_ASSETS = [
  "/",
  "/dashboard",
  "/offline",
];

// Pages à mettre en cache lors de l'installation
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Pre-caching static assets");
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Certaines ressources peuvent ne pas être disponibles — on continue
      });
    })
  );
  self.skipWaiting();
});

// Activation : supprime les anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Stratégie : Network First, fallback cache, fallback offline
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne jamais intercepter : API, auth, login
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/") ||
    url.pathname === "/login" ||
    url.pathname.startsWith("/login")
  ) {
    return; // Laisse passer directement au réseau
  }

  // Pages navigation : Network First avec fallback cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Ne mettre en cache que les réponses valides (status 200)
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Essayer le cache
          const cached = await caches.match(request);
          if (cached) return cached;
          // Essayer la page offline
          const offline = await caches.match("/offline");
          if (offline) return offline;
          // Dernier recours : réponse vide mais valide (évite null)
          return new Response("Hors ligne - veuillez vérifier votre connexion.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        })
    );
  }
});


// Gestion des push notifications
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

// Clic sur notification push
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
