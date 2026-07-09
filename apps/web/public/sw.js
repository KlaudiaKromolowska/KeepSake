// Keepsake service worker — app-shell / static-asset caching ONLY (V3 offline-first PWA,
// PLAN.md §12: care-home Wi-Fi is bad, never lose a trial).
//
// Security / data minimization: this worker never caches patient or session data. It only
// caches GET requests for build-hashed static assets, the manifest, the icons, and one static
// offline-fallback page. Every other request — every server action (POST), every dynamic SSR
// page (dashboard, kiosk session, etc.), every /api/* call — is left untouched and always goes
// to the network, so nothing authenticated or health-related is ever written into this cache.
// Bump SW_VERSION on every deploy that changes any precached content — especially `/offline`,
// which is otherwise served stale forever (cache-first, see isStaticAsset below). `activate`
// deletes every cache whose name isn't the current CACHE_NAME (see below), so a version bump is
// the ONLY step ever needed to force clients onto the new shell. `/_next/static/*` is separately
// build-hashed per file and is unaffected either way.
const SW_VERSION = "v1";
const CACHE_NAME = `keepsake-shell-${SW_VERSION}`;
const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/offline"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never touch server actions / mutations
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // same-origin shell assets only

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    // Network-first for pages; the offline fallback is the ONLY page response ever cached, and
    // it's a static shell with no patient data.
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
  }
  // Everything else (dynamic pages, /api/*, auth callbacks): network only, never cached.
});
