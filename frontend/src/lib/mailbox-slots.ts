export interface MailboxSlotStatus {
  used: number;
  /** null = cheksiz reja. */
  limit: number | null;
  full: boolean;
  plan: string;
}

export interface OwnedMailbox {
  id: string;
  email: string;
  tradeId: string | null;
  createdAt: string;
  handedOffAt: string | null;
}

/**
 * Slot holati.
 *
 * <p>Xato YUTILADI va "to'lmagan" deb qaytariladi: bu ogohlantirish
 * profil sahifasining yon qismida turadi va uni yuklab bo'lmagani
 * uchun butun sahifani yiqitib bo'lmaydi.
 */
export async function fetchSlotStatus(): Promise<MailboxSlotStatus | null> {
  try {
    const response = await fetch('/api/trade/v1/mailboxes/slots', {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) return null;
    return (await response.json()) as MailboxSlotStatus;
  } catch {
    return null;
  }
}

export async function fetchOwnedMailboxes(): Promise<OwnedMailbox[]> {
  const response = await fetch('/api/trade/v1/mailboxes', {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Pochta qutilari yuklanmadi');
  return response.json();
}

export async function deleteMailbox(id: string): Promise<void> {
  const response = await fetch(`/api/trade/v1/mailboxes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? "Pochta qutisini o'chirib bo'lmadi");
  }
}

/**
 * Slot to'lgani haqidagi matn.
 *
 * <p>Raqamlar bilan: "joy qolmadi" degan gap odamga nima qilishni
 * aytmaydi, "3 tadan 3 tasi band" esa nechtasini bo'shatish
 * kerakligini darhol ko'rsatadi.
 */
export function slotWarning(status: MailboxSlotStatus | null): string | null {
  if (!status || !status.full || status.limit === null) return null;
  return `Pochta limiti: ${status.limit} tadan ${status.used} ta joy ajratilgan. `
    + 'Sizga tegishli va savdo uchun ajratilgan qutilar limitga kiradi. Yangi savdodan oldin qutilaringizni ko‘rib chiqing.';
}

/**
 * Quti savdoda bandmi.
 *
 * <p>Band bo'lsa o'chirib bo'lmaydi va tugma ham berilmasligi kerak:
 * bosilib, keyin rad etilgan tugma foydalanuvchini chalg'itadi.
 */
export function isDeletable(mailbox: OwnedMailbox): boolean {
  return mailbox.tradeId === null;
}
