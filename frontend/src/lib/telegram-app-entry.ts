import { validCampaignCode } from './campaign-capture';

/**
 * Login Widget telefonda va ilova ichidagi brauzerlarda (Telegram, Instagram,
 * Facebook) eng ko'p uziladigan qadam: popup bloklanadi yoki telefon raqami
 * va Telegram'dagi tasdiq so'raladi. Bot esa Telegram ilovasida ochiladi va
 * Mini App avtomatik kiradi — shuning uchun bunday qurilmalarda birinchi
 * bo'lib "Telegram ilovasida ochish" taklif qilinadi.
 */
const MOBILE = /Android|iPhone|iPad|iPod|Mobile/i;
const IN_APP = /Telegram|Instagram|FBAN|FBAV|FB_IAB|Line\//i;

export function prefersTelegramApp(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return MOBILE.test(userAgent) || IN_APP.test(userAgent);
}

/** Kod shakli — UpdateHandler.startPayload / campaignPayload bilan bir xil. */
const CODE = /^[A-Z0-9]{8}$/;

function validReferral(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return CODE.test(code) ? code : null;
}

interface EntrySources {
  campaign?: string | null;
  referral?: string | null;
}

/**
 * Botga havola. `/start` bitta yuk oladi: kampaniya bo'lsa `c_<kod>`
 * (manba yo'qolmasin), bo'lmasa referal `ref_<kod>`. Cookie'dagi qiymat
 * o'zgartirilgan bo'lishi mumkin — shakldan o'tmagani yuborilmaydi.
 */
export function telegramAppEntryHref(botUsername: string, sources: EntrySources): string {
  const base = `https://t.me/${botUsername.replace(/^@/, '').trim()}`;
  const campaign = validCampaignCode(sources.campaign);
  if (campaign) return `${base}?start=c_${campaign}`;
  const referral = validReferral(sources.referral);
  if (referral) return `${base}?start=ref_${referral}`;
  return base;
}
