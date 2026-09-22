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

export type SlotPressure = 'none' | 'near' | 'full';

/**
 * Slot bosimi darajasi.
 *
 * <p>Arafa chegarasi rejaning 20% i, eng kami bitta joy: 3 slotli rejada
 * bitta joy qolganda, 10 slotlida ikkitasida ogohlantiradi. To'lgandan
 * keyin aytish kech — o'sha paytda savdo allaqachon rad etilgan bo'ladi.
 */
export function slotPressure(status: MailboxSlotStatus | null): SlotPressure {
  if (!status || status.limit === null) return 'none';
  if (status.full || status.used >= status.limit) return 'full';
  const near = Math.max(1, Math.ceil(status.limit * 0.2));
  return status.limit - status.used <= near ? 'near' : 'none';
}

/**
 * Slot holati haqidagi matn.
 *
 * <p>Raqamlar bilan: "joy qolmadi" degan gap odamga nima qilishni
 * aytmaydi, "3 tadan 3 tasi band" esa nechtasini bo'shatish
 * kerakligini darhol ko'rsatadi. Arafada esa nechta joy qolganini
 * aytadi — odam savdoni boshlashdan oldin o'zi hal qilsin.
 */
export function slotWarning(status: MailboxSlotStatus | null): string | null {
  const pressure = slotPressure(status);
  if (pressure === 'none' || !status || status.limit === null) return null;
  if (pressure === 'full') {
    return `Pochta limiti: ${status.limit} tadan ${status.used} ta joy ajratilgan. `
      + 'Sizga tegishli va savdo uchun ajratilgan qutilar limitga kiradi. Yangi savdodan oldin qutilaringizni ko‘rib chiqing.';
  }
  const left = status.limit - status.used;
  return `Pochta limiti: ${status.limit} tadan ${status.used} ta joy ajratilgan — `
    + `${left} ta qoldi. Har savdo yangi quti ochadi, shuning uchun keraksizlarini hozir bo‘shating.`;
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
