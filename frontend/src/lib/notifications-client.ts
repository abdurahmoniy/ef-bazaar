import { formatTiyin } from './money';
import { siteConfig } from './site';
import { FEATURES } from './feature-flags';
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
    case 'WALLET_CREDITED':
      // The amount is stored on the row; the balance deliberately is not. This
      // list is read days later, and a balance frozen at one row's moment would
      // be wrong by then while looking authoritative — the wallet it links to
      // is the live figure.
      return n.amountTiyin != null
        ? `Hamyoningiz ${formatTiyin(n.amountTiyin)} so\u2018mga to\u2018ldirildi`
        : 'Hamyoningiz to\u2018ldirildi';
    case 'WITHDRAWAL_REQUESTED':
      return 'Yangi pul yechish so\u2019rovi';
    case 'WITHDRAWAL_PAID':
      return 'Pul yechish tasdiqlandi \u2014 kartangizga o\u2019tkazildi';
    case 'WITHDRAWAL_REJECTED':
      return 'Pul yechish rad etildi \u2014 mablag\u2018 hamyoningizga qaytarildi';
    case 'TRADE_MAILBOX_RECEIVED':
      return 'Savdo yakunlandi \u2014 akkount emaili profilingizga qo\u2019shildi';
    case 'TRADE_MAILBOX_RETURNED':
      return 'Savdo yakunlanmadi \u2014 sizga berilgan email profilingizga biriktirildi';
    case 'TRADE_PROPOSAL_CREATED':
      return 'Sizga yangi savdo taklifi yuborildi';
    case 'TRADE_STARTED':
      return 'Savdo boshlandi';
    case 'TRADE_EMAIL_CHANGE_CODE':
      return `Konami emailini o‘zgartirish kodi${n.verificationCode ? `: ${n.verificationCode}` : ''}`;
    case 'TRADE_LOGIN_CODE':
      return `Konami kirish kodi${n.verificationCode ? `: ${n.verificationCode}` : ''}`;
    case 'TRADE_EMAIL_CHANGED':
      return 'Sotuvchi Konami emailini o‘zgartirdi';
    case 'TRADE_PASSWORD_SENT':
      return 'Konami paroli yuborildi \u2014 tekshirib tasdiqlang';
    case 'TRADE_SUCCESS':
      return 'Savdo muvaffaqiyatli yakunlandi';
    case 'TRADE_REJECTED':
      return 'Savdo rad etildi';
    case 'TRADE_ORPHANED':
      return 'Savdo muddati tugadi';
    case 'PARTNER_APPROVED':
      return 'Hamkorligingiz tasdiqlandi — kanalingiz reklama bozorida';
    case 'PARTNER_REJECTED':
      return 'Hamkorlik arizasi rad etildi';
    case 'PARTNER_CANCELLED':
      return 'Hamkorligingiz to‘xtatildi';
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
  if (n.type === 'WALLET_CREDITED') return '/hamyon';
  // Tasdiqlangani PANELGA: hamkor u yerda e'lon narxini qo'yadi va u
  // hozir nolda turibdi. Qolgan ikkisida panel yopiq, ariza sahifasi
  // esa nima bo'lganini va sababini ko'rsatadi.
  if (n.type === 'PARTNER_APPROVED') return '/partner';
  if (n.type === 'PARTNER_REJECTED' || n.type === 'PARTNER_CANCELLED') return '/partnership';
  // The inbox itself, not the trade: the trade is over, and what the reader
  // needs is the mail — Konami's codes arrive there if they want to move the
  // account on to an address of their own. Absolute because the webmail is a
  // separate host.
  if (n.type === 'TRADE_MAILBOX_RECEIVED' || n.type === 'TRADE_MAILBOX_RETURNED') {
    return siteConfig.mailUrl;
  }
  // Only moderator invitations belong in the human-admin workspace. Trade
  // participants use the chat, including when a notification carries a trade id.
  if (n.type === 'TRADE_ADMIN_INVITED' && FEATURES.humanAdmin && n.tradeId) {
    return `/trade-admin?tradeId=${encodeURIComponent(n.tradeId)}`;
  }
  if (n.chatId) return `/chats/${encodeURIComponent(n.chatId)}`;
  if (n.listingId) return `/marketplace/${encodeURIComponent(n.listingId)}`;
  if (n.tradeId) return '/chats';
  return null;
}
