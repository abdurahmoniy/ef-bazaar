import type { MailboxAccessFields } from './mailbox-access';
export interface MailboxSlotStatus extends Omit<MailboxAccessFields, 'selectedForFree'> {
  selectedForFreeCount?: number;
  /** Compatibility aliases of totalUsed / totalLimit. */
  used: number;
  /** null = cheksiz reja. */
  limit: number | null;
  /** Separate gifts/resources are additive during rollout. */
  exemptUsed?: number;
  resourceUsed?: number;
  totalUsed: number;
  totalLimit: number | null;
  customUsed: number;
  /** New custom creation sublimit, included in totalLimit. */
  customLimit: number | null;
  full: boolean;
  plan: string;
  /** Qulflangan qutilar soni (tarif pasaygandan keyin). */
  lockedCount: number;
}

export interface OwnedMailbox extends MailboxAccessFields {
  id: string;
  email: string;
  tradeId: string | null;
  createdAt: string;
  handedOffAt: string | null;
  /** Qulflangan: pochtasi o'qilmaydi, lekin quti o'chirilmaydi. */
  locked: boolean;
  /** CUSTOM shares the total pool, but its name cannot be released. */
  kind?: 'RANDOM' | 'CUSTOM';
  /** Admin gifts do not consume the total pool. */
  slotExempt?: boolean;
  /** Current trade state, unlike the historical tradeId. */
  activeTrade?: boolean;
  /** Akkount tasdiqlangan quti (trade-service). */
  linkedAccountId?: string | null;
  /** Hozir ulanayotgan bo'lsa — ulash sessiyasi. */
  activeSessionId?: string | null;
  /** Null — Mailcow hali tasdiqlamagan. */
  provisionedAt?: string | null;
}

/**
 * Slot holati.
 *
 * <p>Xato YUTILADI va noma’lum (`null`) qaytariladi: bu ogohlantirish
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
    const status: unknown = await response.json();
    return isMailboxSlotStatus(status) ? status : null;
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

/**
 * Qutini o'zidan uzadi — kirishni bekor qiladi, ajratilgan resurs saqlanadi.
 *
 * <p>O'chirish EMAS: quti platformada qoladi va pochta serveridan olib
 * tashlash faqat admin panelida. Foydalanuvchida bunday yo'l yo'q va
 * bo'lmasligi kerak — quti Konami parol tiklash xatlarini saqlaydi va
 * nizo chiqqanda tekshiriladigan yagona iz o'sha.
 */
export async function detachMailbox(id: string): Promise<void> {
  const response = await fetch(`/api/trade/v1/mailboxes/${encodeURIComponent(id)}/detach`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? "Pochta qutisini uzib bo'lmadi");
  }
}

/**
 * Qulflangan qutini ochadi, o'rniga ochiq qutini qulflaydi.
 *
 * <p>409 `invalid_unlock_swap` xabari (o'zbekcha) backenddan keladi va
 * o'sha holicha ko'rsatiladi.
 */
export async function unlockMailbox(lockedId: string, lockInsteadId: string): Promise<void> {
  const response = await fetch(`/api/trade/v1/mailboxes/${encodeURIComponent(lockedId)}/unlock`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ lockInsteadId }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.message || 'Qutini ochib bo‘lmadi');
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
  if (!status || status.totalLimit === null) return 'none';
  if (status.full || status.totalUsed >= status.totalLimit) return 'full';
  const near = Math.max(1, Math.ceil(status.totalLimit * 0.2));
  return status.totalLimit - status.totalUsed <= near ? 'near' : 'none';
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
  if (pressure === 'none' || !status || status.totalLimit === null) return null;
  if (pressure === 'full') {
    return `Pochta limiti: ${status.totalLimit} tadan ${status.totalUsed} ta joy ajratilgan. `
      + `${slotUsageSummary(status)}. Sizga tegishli va savdo uchun ajratilgan qutilar limitga kiradi. Yangi savdodan oldin qutilaringizni ko‘rib chiqing.`;
  }
  const left = status.totalLimit - status.totalUsed;
  return `Pochta limiti: ${status.totalLimit} tadan ${status.totalUsed} ta joy ajratilgan — `
    + `${left} ta qoldi. ${slotUsageSummary(status)}. Har savdo yangi quti ajratadi. Qutini o‘zingizdan uzish jami ajratilgan joyni kamaytirmaydi.`;
}

/**
 * Quti savdoda bandmi.
 *
 * <p>Band bo'lsa o'chirib bo'lmaydi va tugma ham berilmasligi kerak:
 * bosilib, keyin rad etilgan tugma foydalanuvchini chalg'itadi.
 */
export function isDeletable(mailbox: OwnedMailbox): boolean {
  return mailbox.tradeId === null && mailbox.kind !== 'CUSTOM';
}

/**
 * All owned boxes participate in read-access selection. Custom boxes remain
 * visible for locking/swapping; isDeletable still protects their names.
 */
export function cleanupCandidates(mailboxes: OwnedMailbox[]): OwnedMailbox[] {
  return mailboxes;
}

/** Akkountlarga biriktirilgan manzillar — solishtiruv uchun kichik registrda. */
export function accountEmailSet(accounts: { email: string | null }[]): Set<string> {
  const out = new Set<string>();
  for (const account of accounts) {
    if (account.email) out.add(account.email.trim().toLowerCase());
  }
  return out;
}

/**
 * Quti biror akkountga biriktirilganmi.
 *
 * <p>Biriktirilgani — o'sha akkountning Konami paroli tiklanadigan
 * manzil, ya'ni uni o'chirish akkountni qaytarib bo'lmaydigan darajada
 * yo'qotishi mumkin. Biriktirilmagani esa savdodan qolgan quruq quti.
 */
export function isAttachedTo(mailbox: OwnedMailbox, accountEmails: ReadonlySet<string>): boolean {
  return accountEmails.has(mailbox.email.trim().toLowerCase());
}

/** Avval o'chirish xavfsizlari: bog'lanmagan va bo'sh, keyin bog'langan, oxirida savdodagi. */
export function sortForCleanup(
  mailboxes: OwnedMailbox[],
  accountEmails: ReadonlySet<string>,
): OwnedMailbox[] {
  const rank = (m: OwnedMailbox) => {
    if (!isDeletable(m)) return 2;
    return isAttachedTo(m, accountEmails) ? 1 : 0;
  };
  return [...mailboxes].sort((a, b) => rank(a) - rank(b));
}

/** Quota totals come from the API; a custom creation allowance is a subset. */
export function slotUsageSummary(status: MailboxSlotStatus): string {
  return `Jami: ${status.totalUsed} / ${status.totalLimit === null ? 'cheksiz' : status.totalLimit}`
    + ` · shundan custom: ${status.customUsed} / ${status.customLimit === null ? 'cheksiz' : status.customLimit}`
    + (status.exemptUsed !== undefined && status.resourceUsed !== undefined
      ? ` · Limitdan tashqari qutilar: ${status.exemptUsed} · Resursda: ${status.resourceUsed}` : '');
}

/** Legacy random-only responses must remain unknown during a rolling deploy. */
export function isMailboxSlotStatus(value: unknown): value is MailboxSlotStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Record<string, unknown>;
  const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  const limit = (v: unknown) => v === null || count(v);
  return count(status.totalUsed) && limit(status.totalLimit)
    && count(status.customUsed) && limit(status.customLimit)
    && count(status.lockedCount) && typeof status.full === 'boolean'
    && typeof status.plan === 'string'
    && (status.exemptUsed === undefined || count(status.exemptUsed))
    && (status.resourceUsed === undefined || count(status.resourceUsed));
}
