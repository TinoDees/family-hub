// Minimal service worker: makes the app installable in stricter browsers.
// Network passthrough — no offline caching yet.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
