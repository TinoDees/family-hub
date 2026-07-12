// Minimal service worker: exists only to satisfy installability checks.
// Deliberately NO fetch handler — Tracey's offline worker broke Next.js
// client navigation, so this one never touches a request.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
