/**
 * Kampaniya kodini URL'dan olib, ro'yxatdan o'tishgacha saqlab turadi.
 *
 * `?c=<kod>` — admin yaratgan manba havolasi (guruhdagi post, ijtimoiy
 * tarmoq, tanishlar). Referaldan (`?ref=`, `?p=`) MUSTAQIL: referal "kim
 * olib keldi" degan savolga javob beradi, kampaniya — "qayerdan keldi".
 *
 * Ikki cookie: biri kodning o'zi (ro'yxatdan o'tgach da'vo qilinadi),
 * ikkinchisi "bu bosilish hali sanalmagan" belgisi. Belgi bo'lmasa har
 * sahifa ochilishi yangi bosilish bo'lib sanalardi.
 *
 * Kodni middleware yozadi — `referral-capture.ts` dagi bilan bir xil sabab:
 * login'ga yo'naltiradigan sahifada React komponenti umuman mount bo'lmaydi.
 */

export const CAMPAIGN_COOKIE = 'efbazaar_src';
export const CAMPAIGN_CLICK_COOKIE = 'efbazaar_src_click';

/** Kod shakli — CampaignService va UpdateHandler.campaignPayload bilan bir xil. */
const CODE = /^[A-Z0-9]{8}$/;

export function validCampaignCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return CODE.test(code) ? code : null;
}

export function readCampaignFromSearch(search: string): string | null {
  if (!search) return null;
  return validCampaignCode(new URLSearchParams(search).get('c'));
}

/** Cookie foydalanuvchi tomonidan o'zgartirilishi mumkin — shakl tekshiriladi. */
export function readCampaignCookie(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return validCampaignCode(rest.join('='));
  }
  return null;
}

/** Adminka beradigan havolalar — ikkalasi bir xil kampaniyani ko'rsatadi. */
export function campaignLinks(code: string, origin: string, botUsername: string) {
  return {
    site: `${origin}/?c=${code}`,
    // Prefiks `c_` — UpdateHandler.campaignPayload aynan shuni kutadi.
    bot: botUsername ? `https://t.me/${botUsername}?start=c_${code}` : null,
  };
}
