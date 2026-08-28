/**
 * Admin panelidagi foydalanuvchi qidiruvi.
 *
 * <p>Bitta joyda, chunki uni bir necha ekran ishlatadi va ularning
 * hammasida bir xil ishlashi kerak: username, ism, email, Telegram chat id
 * yoki platforma UUID si. Raqam va UUID auth-service'da ANIQ moslik
 * sifatida izlanadi — ular butun holda kiritiladi.
 */

export interface FoundUser {
  id: string;
  telegramId: number | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  email: string | null;
}

export interface UserSearchOptions {
  /**
   * Faqat Telegramga ulanganlar. Botdan xabar yuborish uchun manzil
   * tanlanayotganda shart — ulanmagan odamga xabar yetmaydi. Pulni
   * biriktirishda esa kerak emas: hisob har qanday foydalanuvchida bor.
   */
  telegramOnly?: boolean;
  limit?: number;
}

/** Foydalanuvchini ekranda qanday atash. */
export function userLabel(user: FoundUser): string {
  if (user.telegramUsername) return `@${user.telegramUsername}`;
  const name = [user.telegramFirstName, user.telegramLastName].filter(Boolean).join(' ').trim();
  return name || user.email || user.id;
}

/** Ekrandagi ikkinchi qator — qaysi odam ekanini aniqlashtiradi. */
export function userHint(user: FoundUser): string {
  const parts: string[] = [];
  const name = [user.telegramFirstName, user.telegramLastName].filter(Boolean).join(' ').trim();
  if (user.telegramUsername && name) parts.push(name);
  if (user.telegramId) parts.push(`ID ${user.telegramId}`);
  if (user.email) parts.push(user.email);
  return parts.join(' · ') || user.id;
}

export async function searchUsers(
  search: string,
  options: UserSearchOptions = {},
): Promise<FoundUser[]> {
  const params = new URLSearchParams({
    search,
    page: '0',
    size: String(options.limit ?? 10),
  });
  if (options.telegramOnly) params.set('telegramOnly', 'true');

  const response = await fetch(`/api/auth/v1/admin/users?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Qidiruv ishlamadi (${response.status})`);
  }
  const page = await response.json();
  return (page?.content ?? []) as FoundUser[];
}
