/**
 * The offline fallback screen — nothing else.
 *
 * HostFlow's data all lives in Supabase, so there is no meaningful "offline
 * mode" to build: every real feature needs the network. This worker's only
 * job is to swap the browser's own dinosaur-page error for a branded one when
 * a navigation has nowhere to go. It never intercepts anything else — API
 * calls, Supabase's realtime websocket, JS/CSS chunks all pass straight
 * through untouched, so it cannot serve a stale build or a stale API response.
 */

const CACHE = "hostflow-offline-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  );
});
