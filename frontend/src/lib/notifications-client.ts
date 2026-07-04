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
    default:
      return actor;
  }
}
