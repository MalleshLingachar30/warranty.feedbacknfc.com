const SW_VERSION = "warranty-pwa-v2";
const STATIC_CACHE = `${SW_VERSION}-static`;
const PAGE_CACHE = `${SW_VERSION}-pages`;
const STICKER_API_CACHE = `${SW_VERSION}-sticker-api`;

const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch((error) => {
        console.error("Service worker install failed", error);
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => !cacheName.startsWith(SW_VERSION))
          .map((cacheName) => caches.delete(cacheName)),
      );

      await self.clients.claim();
    })(),
  );
});

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function isStaticAsset(requestUrl) {
  return (
    requestUrl.pathname.startsWith("/_next/static/") ||
    requestUrl.pathname.startsWith("/icons/") ||
    requestUrl.pathname.startsWith("/screenshots/") ||
    /\.(?:css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/i.test(
      requestUrl.pathname,
    )
  );
}

function isAppPageRequest(request, requestUrl) {
  return (
    request.mode === "navigate" &&
    (requestUrl.pathname.startsWith("/dashboard") ||
      requestUrl.pathname.startsWith("/nfc/"))
  );
}

function isPublicStickerApi(request, requestUrl) {
  return (
    request.method === "GET" && requestUrl.pathname.startsWith("/api/sticker/")
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);

  if (networkResponse.ok) {
    await cache.put(request, networkResponse.clone());
  }

  return networkResponse;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  if (!isSameOrigin(requestUrl)) {
    return;
  }

  // Never intercept Clerk proxy requests (auth API, JS bundles, etc.)
  if (requestUrl.pathname.startsWith("/__clerk")) {
    return;
  }

  if (isStaticAsset(requestUrl)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isAppPageRequest(request, requestUrl)) {
    event.respondWith(networkFirst(request, PAGE_CACHE));
    return;
  }

  if (isPublicStickerApi(request, requestUrl)) {
    event.respondWith(networkFirst(request, STICKER_API_CACHE));
  }
});
