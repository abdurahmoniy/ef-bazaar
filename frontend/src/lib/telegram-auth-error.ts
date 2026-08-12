const TELEGRAM_AUTH_ERRORS: Record<string, string> = {
  telegram: 'Telegram orqali kirib bo‘lmadi. Mini Appni Telegram ichidan qayta oching.',
  missing_initdata: 'Telegram ma’lumotlari topilmadi. Mini Appni Telegram ichidan qayta oching.',
  rate_limited: 'Juda ko‘p urinish bo‘ldi, biroz kuting va qayta urinib ko‘ring.',
  RATE_LIMITED: 'Juda ko‘p urinish bo‘ldi, biroz kuting va qayta urinib ko‘ring.',
  INVALID_TELEGRAM_DATA: 'Telegram ma’lumotlari eskirgan yoki noto‘g‘ri. Mini Appni qayta oching.',
};

/** Converts backend redirect codes to a fixed allow-list of consumer-safe copy. */
export function telegramAuthErrorMessage(code?: string): string | null {
  if (!code) return null;
  return TELEGRAM_AUTH_ERRORS[code]
    ?? 'Telegram orqali kirib bo‘lmadi. Mini Appni qayta oching yoki Telegram tugmasidan foydalaning.';
}

export function telegramAuthErrorHref(code: string, from: string) {
  const params = new URLSearchParams({ error: code, from });
  return `/auth/login?${params.toString()}`;
}
