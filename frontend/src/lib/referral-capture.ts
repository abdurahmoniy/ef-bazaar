/**
 * Taklif kodini URL'dan olib, ro'yxatdan o'tishgacha saqlab turadi.
 *
 * Ikki havola shakli bir xil kodni olib yuradi: `?ref=` — sayt
 * havolasi, `?p=` — kanaldagi e'lon posti. Oxirgi bosilgani g'olib.
 *
 * Kod cookie'da saqlanadi, localStorage'da emas: uni middleware yozadi,
 * u esa marshrutlashdan OLDIN ishlaydi. Anonim mehmonni login'ga
 * yo'naltiradigan sahifada React komponenti umuman mount bo'lmaydi —
 * server komponentidagi `redirect()` layout chizilishidan oldin otadi.
 */

export const REFERRAL_COOKIE = 'efbazaar_ref';

/** Kod shakli — ReferralCodeService va UpdateHandler.startPayload bilan bir xil. */
const CODE = /^[A-Z0-9]{8}$/;

function valid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return CODE.test(code) ? code : null;
}

export function readCodeFromSearch(search: string): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  return valid(params.get('ref') ?? params.get('p'));
}

/**
 * Cookie sarlavhasidan kodni oladi va SHAKLINI TEKSHIRADI.
 *
 * Tekshiruv shart: cookie foydalanuvchi tomonidan o'zgartirilishi
 * mumkin, va shakldan o'tmagan qiymat serverga umuman yuborilmasligi
 * kerak.
 */
export function readCookieCode(cookieHeader: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === REFERRAL_COOKIE) return valid(rest.join('='));
  }
  return null;
}

/** Taklif havolalari — ikkalasi bir xil kodni ko'rsatadi. */
export function inviteLinks(code: string, origin: string, botUsername: string) {
  return {
    // Prefiks `ref_` — UpdateHandler.startPayload aynan shuni kutadi.
    bot: botUsername ? `https://t.me/${botUsername}?start=ref_${code}` : null,
    site: `${origin}/?ref=${code}`,
  };
}
