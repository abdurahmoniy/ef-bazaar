import type { TradeResponse } from './trade-types';

/**
 * Kirib tekshirish uchun manzil — QABUL QILINAYOTGAN akkountniki.
 *
 * <p>Obmenda qutilar TESKARI biriktiriladi: har bir taraf o'z akkountini
 * o'z qutisi orqali o'tkazadi, kirib tekshiradigani esa qarshi tomonning
 * qutisi. O'z qutisini ko'rsatish odamga o'z akkountiga kirishni taklif
 * qilish bo'lardi va tekshiruv hech narsani isbotlamasdi.
 *
 * <p>Sotuvda ikkalasi bir xil quti: u bitta va qo'ldan qo'lga o'tadi.
 */
export function receivingMailboxEmail(
  trade: Pick<TradeResponse, 'counterpartMailboxEmail' | 'mailboxEmail'>,
): string {
  return trade.counterpartMailboxEmail ?? trade.mailboxEmail ?? '';
}

export function loginCodeOf(trade: Pick<TradeResponse, 'loginVerificationCode'>): string | null {
  const code = trade.loginVerificationCode;
  return code && code.trim() ? code.trim() : null;
}
