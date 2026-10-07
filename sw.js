/* Eddy's Hell — Web Push service worker. Cache-bust via Hosting headers. */
/* eslint-disable no-undef */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (_) {
    try {
      data = { body: event.data && event.data.text() };
    } catch (__) {
      data = {};
    }
  }
  const title = data.title || "Eddy's Hell";
  const body = data.body || "Someone checked in — your turn?";
  const options = {
    body,
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    tag: data.tag || "eddys-hell-checkin",
    renotify: true,
    data: {
      url: data.url || "/",
      pickId: data.pickId || null,
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification &&
      event.notification.data &&
      event.notification.data.url) ||
    "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          try {
            await client.focus();
            if (client.navigate) await client.navigate(target);
            return;
          } catch (_) {
            /* fall through */
          }
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })()
  );
});
