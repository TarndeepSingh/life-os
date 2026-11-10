/* Offline shell for LifeOS. Network first, so a new deploy is picked up on the next load;
   the cache is only a fallback when offline. User data lives in localStorage and is never cached here. */
const CACHE = "lifeos-shell-v2";
const SHELL = ["./", "index.html", "study.css", "study-core.js", "sync-core.js", "study.js", "cloud.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return; // fonts and anything cross-origin go straight to the network
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; }).catch(() => caches.match(r).then((m) => m || caches.match("index.html"))));
});

/* Reminders: always show a visible notification (required by Safari). The text comes from the server digest. */
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "LifeOS", { body: d.body || "You have something waiting.", icon: "icon-192.png", badge: "icon-192.png", tag: "lifeos-digest", data: { url: d.url || "./" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((l) => { for (const c of l) if ("focus" in c) return c.focus(); return clients.openWindow((e.notification.data && e.notification.data.url) || "./"); }));
});
