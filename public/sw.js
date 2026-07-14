// Nestly service worker.
// Deliberately NO fetch handler — Tracey's offline worker broke Next.js
// client navigation, so this one never touches a request.
// It exists for installability + Web Push.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* non-JSON push — show generic */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Nestly", {
      body: data.body || "",
      icon: "/nestly-icon-192.png",
      badge: "/nestly-icon-192.png",
      tag: data.tag || "nestly",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).pathname === url && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // any open Nestly window? reuse it
      if (list.length > 0 && "focus" in list[0]) {
        list[0].navigate(url);
        return list[0].focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
