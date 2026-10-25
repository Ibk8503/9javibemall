// Service Worker for 9jaVibeMall Logistics Hub Web Push Notifications
/* eslint-disable no-restricted-globals */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming Web Push message
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: "9jaVibeMall Logistics", body: event.data.text() };
    }
  }

  const title = data.title || data.notification?.title || "Logistics Hub Notification";
  const body = data.body || data.notification?.body || "New update received.";
  const url = data.url || data.data?.url || "/incoming";

  const options = {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { url },
    vibrate: [200, 100, 200],
    tag: data.tag || "logistics-notification",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle click on notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/incoming";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If a window client is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
