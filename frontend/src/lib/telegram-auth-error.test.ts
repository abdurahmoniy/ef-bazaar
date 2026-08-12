import { describe, expect, it } from 'vitest';

import { telegramAuthErrorHref, telegramAuthErrorMessage } from './telegram-auth-error';

describe('telegramAuthErrorMessage', () => {
  it('maps known redirect codes to safe recovery copy', () => {
    expect(telegramAuthErrorMessage('missing_initdata')).toContain('Telegram');
    expect(telegramAuthErrorMessage('rate_limited')).toContain('biroz kuting');
  });

  it('never reflects unknown diagnostics into the login UI', () => {
    const message = telegramAuthErrorMessage('503 backend /api secret stack');
    expect(message).toContain('Telegram orqali kirib bo‘lmadi');
    expect(message).not.toMatch(/503|backend|api|secret|stack/i);
  });

  it('preserves the safe deep-link target through an auth failure redirect', () => {
    expect(telegramAuthErrorHref('INVALID_TELEGRAM_DATA', '/marketplace/listing-1?q=Messi')).toBe(
      '/auth/login?error=INVALID_TELEGRAM_DATA&from=%2Fmarketplace%2Flisting-1%3Fq%3DMessi',
    );
  });
});
