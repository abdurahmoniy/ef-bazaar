/* Loaded before Firebase so our click handler owns notification navigation. */
function pushDestination(value) {
  const fallback = self.location.origin + '/notifications';
  try {
    const url = new URL(value || '/notifications', self.location.origin);
    if (url.origin !== self.location.origin || !/^\/(notifications|chats|marketplace|hamyon|partner|partnership|trade-admin|admin)(\/|$)/.test(url.pathname)) return fallback;
    return url.href;
  } catch { return fallback; }
}

async function currentPushUser() {
  try {
    const response = await fetch('/api/push/session', { credentials: 'same-origin', cache: 'no-store' });
    return response.ok ? (await response.json()).userId : null;
  } catch { return null; }
}

self.handleBackgroundPush = async function (payload) {
  const data = payload.data || {};
  if (!data.recipientUserId || await currentPushUser() !== data.recipientUserId) return;
  await self.registration.showNotification(data.title || 'eFBazaar', {
    body: data.body || 'Yangi bildirishnoma',
    icon: '/brand-icon/192',
    tag: data.notificationId || 'efbazaar',
    data: { url: pushDestination(data.url), recipientUserId: data.recipientUserId },
  });
};

self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data || {};
    const url = await currentPushUser() === data.recipientUserId ? pushDestination(data.url) : pushDestination('/notifications');
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(url);
      return existing.focus();
    }
    return self.clients.openWindow(url);
  })());
});
