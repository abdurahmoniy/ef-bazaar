import { buildMarketplaceApiPath } from './marketplace-client-api';

export type SupportCategory = 'SUPPORT' | 'PARTNERSHIP' | 'QUESTION';
export type SupportChatStatus = 'OPEN' | 'REPLIED' | 'CLOSED';
export type SupportSenderType = 'USER' | 'ADMIN';

export interface SupportMessage {
  id: string;
  supportChatId: string;
  senderType: SupportSenderType;
  senderName: string;
  content: string;
  createdAt: string;
}

export interface SupportChat {
  id: string;
  category: SupportCategory;
  status: SupportChatStatus;
  senderName: string;
  senderContact?: string | null;
  messages: SupportMessage[];
  lastMessageAt: string;
  createdAt: string;
}

export const SUPPORT_CATEGORIES: Record<
  SupportCategory,
  { label: string; description: string; badge: string }
> = {
  SUPPORT: {
    label: 'Texnik yordam',
    description: 'Xarid, savdo, to‘lov yoki saytdagi muammolar',
    badge: '🛠 Yordam',
  },
  PARTNERSHIP: {
    label: 'Hamkorlik',
    description: 'Telegram kanal egalari, reklama va hamkorlik takliflari',
    badge: '🤝 Hamkorlik',
  },
  QUESTION: {
    label: 'Umumiy savol',
    description: 'efBazaar qoidalari va imkoniyatlari bo‘yicha savollar',
    badge: '❓ Savol',
  },
};

const GUEST_SESSION_STORAGE_KEY = 'efbazaar_support_guest_session';

export function getOrCreateGuestSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let sid = window.localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
    if (!sid) {
      sid = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'guest-' + Math.random().toString(36).substring(2, 15);
      window.localStorage.setItem(GUEST_SESSION_STORAGE_KEY, sid);
    }
    return sid;
  } catch {
    return '';
  }
}

export async function createSupportChat(input: {
  category: SupportCategory;
  message: string;
  senderName?: string;
  senderContact?: string;
  guestSessionId?: string;
}): Promise<SupportChat> {
  const sid = input.guestSessionId || getOrCreateGuestSessionId();
  const res = await fetch(buildMarketplaceApiPath('/api/v1/support/chats'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(sid ? { 'X-Guest-Session-Id': sid } : {}),
    },
    body: JSON.stringify({
      category: input.category,
      message: input.message,
      senderName: input.senderName,
      senderContact: input.senderContact,
      guestSessionId: sid,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Murojaat yaratib bo‘lmadi');
  }

  return res.json();
}

export async function getActiveSupportChat(guestSessionId?: string): Promise<SupportChat | null> {
  const sid = guestSessionId || getOrCreateGuestSessionId();
  const res = await fetch(
    buildMarketplaceApiPath(`/api/v1/support/chats/active${sid ? `?guestSessionId=${encodeURIComponent(sid)}` : ''}`),
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        ...(sid ? { 'X-Guest-Session-Id': sid } : {}),
      },
    }
  );

  if (res.status === 204) return null;
  if (!res.ok) return null;

  return res.json();
}

export async function getSupportChat(chatId: string, guestSessionId?: string): Promise<SupportChat> {
  const sid = guestSessionId || getOrCreateGuestSessionId();
  const res = await fetch(
    buildMarketplaceApiPath(`/api/v1/support/chats/${chatId}${sid ? `?guestSessionId=${encodeURIComponent(sid)}` : ''}`),
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        ...(sid ? { 'X-Guest-Session-Id': sid } : {}),
      },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Murojaatni yuklab bo‘lmadi');
  }

  return res.json();
}

export async function sendSupportMessage(
  chatId: string,
  content: string,
  guestSessionId?: string
): Promise<SupportMessage> {
  const sid = guestSessionId || getOrCreateGuestSessionId();
  const res = await fetch(buildMarketplaceApiPath(`/api/v1/support/chats/${chatId}/messages`), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(sid ? { 'X-Guest-Session-Id': sid } : {}),
    },
    body: JSON.stringify({
      content,
      guestSessionId: sid,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Xabar yuborilmadi');
  }

  return res.json();
}

export async function closeSupportChat(chatId: string, guestSessionId?: string): Promise<SupportChat> {
  const sid = guestSessionId || getOrCreateGuestSessionId();
  const res = await fetch(buildMarketplaceApiPath(`/api/v1/support/chats/${chatId}/close`), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(sid ? { 'X-Guest-Session-Id': sid } : {}),
    },
    body: JSON.stringify({
      guestSessionId: sid,
    }),
  });

  if (!res.ok) {
    throw new Error('Murojaatni yopib bo‘lmadi');
  }

  return res.json();
}
