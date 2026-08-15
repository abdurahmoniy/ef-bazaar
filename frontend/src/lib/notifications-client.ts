import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import type { NotificationResponse, PageResponse } from '@/lib/marketplace-types';

export async function fetchUnreadCount(): Promise<number | null> {
  try {
    const res = await fetch(buildMarketplaceApiPath(['v1', 'notifications', 'unread-count']), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { count?: number };
    return typeof payload.count === 'number' ? payload.count : null;
  } catch {
    return null;
  }
}

export async function fetchNotifications(size = 15): Promise<NotificationResponse[]> {
  try {
    const params = new URLSearchParams({ size: String(size) });
    const res = await fetch(buildMarketplaceApiPath(['v1', 'notifications'], params), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const page = (await res.json()) as PageResponse<NotificationResponse>;
    return page.content ?? [];
  } catch {
    return [];
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await fetch(buildMarketplaceApiPath(['v1', 'notifications', id, 'read']), {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // best-effort — the row stays unread and re-syncs on next poll
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  try {
    await fetch(buildMarketplaceApiPath(['v1', 'notifications', 'read-all']), {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // best-effort
  }
}

export function notificationLabel(n: NotificationResponse): string {
  const actor = n.actorDisplayName?.trim() || 'Foydalanuvchi';
  switch (n.type) {
    case 'CHAT_CREATED':
      return `${actor} e'loningiz uchun bog'landi`;
    case 'CHAT_MESSAGE':
      return `${actor} sizga xabar yozdi`;
    case 'TRADE_ADMIN_INVITED':
      return `${actor} sizni inson admin savdosiga chaqirdi`;
    case 'WITHDRAWAL_REQUESTED':
      return 'Yangi pul yechish so\u2019rovi';
    case 'WITHDRAWAL_PAID':
      return 'Pul yechish tasdiqlandi \u2014 kartangizga o\u2019tkazildi';
    case 'WITHDRAWAL_REJECTED':
      return 'Pul yechish rad etildi \u2014 mablag\u2018 hamyoningizga qaytarildi';
    default:
      return actor;
  }
}

export function notificationHref(n: NotificationResponse): string | null {
  // Withdrawals split by audience: an admin is being sent to the queue to pay
  // somebody, the owner to their own wallet to see it landed.
  if (n.type === 'WITHDRAWAL_REQUESTED') {
    return `/admin/payments/withdrawals?ticket=${encodeURIComponent(n.withdrawalId ?? '')}`;
  }
  if (n.type === 'WITHDRAWAL_PAID' || n.type === 'WITHDRAWAL_REJECTED') return '/hamyon';
  if (n.tradeId) return `/trade-admin?tradeId=${encodeURIComponent(n.tradeId)}`;
  if (n.chatId) return `/chats/${encodeURIComponent(n.chatId)}`;
  if (n.listingId) return `/marketplace/${encodeURIComponent(n.listingId)}`;
  return null;
}
