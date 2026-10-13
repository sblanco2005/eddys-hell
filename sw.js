/* Eddy's Hell — Web Push service worker. Cache-bust via Hosting headers. */
/* eslint-disable no-undef */
// SW version — bump to force an update on installed Home Screen apps.
const EH_SW_VERSION = "prod-steal-20261013c";
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
  const raw =
    (event.notification &&
      event.notification.data &&
      event.notification.data.url) ||
    "/";
  let target;
  try {
    target = new URL(raw, self.location.origin).href;
  } catch (_) {
    target = self.location.origin + "/";
  }
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Prefer an already-open window on the same origin: focus it and
      // navigate to the target (same-origin only; cross-origin navigate throws).
      const sameOrigin = new URL(target).origin === self.location.origin;
      for (const client of all) {
        if (!("focus" in client)) continue;
        try {
          const focused = await client.focus();
          if (sameOrigin && client.url !== target && (focused || client).navigate) {
            await (focused || client).navigate(target);
          }
          return;
        } catch (_) {
          /* try next / fall through */
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })()
  );
});
