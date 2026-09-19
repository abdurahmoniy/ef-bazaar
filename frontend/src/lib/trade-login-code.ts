import type { TradeResponse } from './trade-types';

/**
 * Akkountga kirish kodi bosqichi.
 *
 * <p>Oluvchi akkountga kirmoqchi bo'lganda Konami tasdiqlash kodini pochtaga
 * yuboradi, pochta esa hali platformada — kodni smart admin o'qib beradi.
 * Kod kelmaguncha "Tasdiqlash" yopiq: ko'rmasdan tasdiqlash savdoning butun
 * ma'nosini yo'qotadi.
 *
 * <p>Qoida shu yerda, panel ichida emas: u panelning 2000 qatori orasida
 * ko'zdan qochadigan shart va uni test bilan qulflab qo'yish arzonroq.
 */
export function loginCodeOf(trade: Pick<TradeResponse, 'loginVerificationCode'>): string | null {
  const code = trade.loginVerificationCode;
  return code && code.trim() ? code.trim() : null;
}

/**
 * Tasdiqlash hozir yopiqmi.
 *
 * <p>Backend `confirmUnlocksAt` ni faqat kod hali kelmagan holatda yuboradi.
 * Muddat o'tgach tugma ochiladi: 2FA so'ramaydigan akkountlar ham bor va
 * ular odamni savdo ichida qamab qo'ymasligi kerak.
 */
export function isConfirmLocked(
  trade: Pick<TradeResponse, 'confirmUnlocksAt'>,
  now: number = Date.now(),
): boolean {
  const unlocksAt = trade.confirmUnlocksAt;
  if (!unlocksAt) return false;
  const parsed = Date.parse(unlocksAt);
  if (Number.isNaN(parsed)) return false;
  return now < parsed;
}
