self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Watermelon CRM", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Watermelon CRM";
  const options = {
    body: data.body || "Há uma atualização no CRM.",
    icon: data.icon || "/logo-icon.png",
    badge: data.badge || "/logo-icon.png",
    tag: data.tag || "watermelon-crm",
    data: { url: data.url || "/admin" },
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/admin", self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(target) : undefined;
    })
  );
});
