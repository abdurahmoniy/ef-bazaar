import type { User } from './types';

/**
 * Admin katalogini egasi bo'yicha suzish.
 *
 * <p>Admin nom yoki username yozadi, katalog esa id bilan ishlaydi — nomlar
 * auth-service'da, e'lonlar marketplace'da. Shuning uchun qidiruv ikki
 * qadam: avval odamni topamiz, keyin uning e'lonlarini.
 *
 * <p>Qaror shu yerda, sahifa ichida emas: "nechta topildi" degan savolning
 * to'rtta javobi bor va ularning har biri ekranda boshqacha ko'rinadi.
 */
export type OwnerFilter =
  /** Qidiruv yo'q — butun katalog. */
  | { mode: 'none' }
  /** Bitta odam aniq topildi (yoki id to'g'ridan-to'g'ri berilgan). */
  | { mode: 'single'; ownerId: string; label: string }
  /** Bir nechta mos keldi — admin tanlaydi. */
  | { mode: 'choose'; candidates: User[] }
  /** Hech kim topilmadi. */
  | { mode: 'missing'; query: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ro'yxatda ko'rinadigan nom: username bor bo'lsa u, aks holda ismi. */
export function ownerLabel(user: User): string {
  const username = user.telegramUsername?.trim();
  if (username) return username.startsWith('@') ? username : `@${username}`;
  const name = user.displayName?.trim();
  return name || user.id;
}

/**
 * Qidiruv natijasidan qaror chiqaradi.
 *
 * @param ownerId havoladagi tayyor id (admin ro'yxatdan tanlagan bo'lsa)
 * @param query   admin yozgan matn
 * @param matches auth-service topgan foydalanuvchilar
 */
export function resolveOwnerFilter(
  ownerId: string | undefined,
  query: string | undefined,
  matches: User[],
): OwnerFilter {
  const trimmed = query?.trim() ?? '';

  if (ownerId && UUID.test(ownerId)) {
    // Ro'yxatdan tanlangan bo'lsa nomni ham o'sha ro'yxatdan olamiz;
    // topilmasa id ning o'zi ko'rinadi — suzgich baribir ishlaydi.
    const known = matches.find((user) => user.id === ownerId);
    return { mode: 'single', ownerId, label: known ? ownerLabel(known) : ownerId };
  }

  if (!trimmed) return { mode: 'none' };
  if (matches.length === 0) return { mode: 'missing', query: trimmed };
  if (matches.length === 1) {
    return { mode: 'single', ownerId: matches[0].id, label: ownerLabel(matches[0]) };
  }
  return { mode: 'choose', candidates: matches };
}
