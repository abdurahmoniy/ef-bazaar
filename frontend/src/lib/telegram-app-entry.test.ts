import { describe, expect, it } from 'vitest';

import { prefersTelegramApp, telegramAppEntryHref } from './telegram-app-entry';

describe('prefersTelegramApp', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 350.0'],
    ['Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 Telegram-Android/11.2.0'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/480.0]'],
  ])('prefers the Telegram app on phones and in-app browsers: %s', (ua) => {
    expect(prefersTelegramApp(ua)).toBe(true);
  });

  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15'],
    [''],
    [null],
  ])('keeps the login widget first on desktop: %s', (ua) => {
    expect(prefersTelegramApp(ua)).toBe(false);
  });
});

describe('telegramAppEntryHref', () => {
  it('opens the bot without a payload by default', () => {
    expect(telegramAppEntryHref('EfBazaarBot', {})).toBe('https://t.me/EfBazaarBot');
  });

  it('strips a leading @ from the bot username', () => {
    expect(telegramAppEntryHref('@EfBazaarBot', {})).toBe('https://t.me/EfBazaarBot');
  });

  it('carries the campaign code so the bot keeps the acquisition source', () => {
    expect(telegramAppEntryHref('EfBazaarBot', { campaign: 'grp23456', referral: 'ABCD2345' }))
      .toBe('https://t.me/EfBazaarBot?start=c_GRP23456');
  });

  it('falls back to the referral code when there is no campaign', () => {
    expect(telegramAppEntryHref('EfBazaarBot', { referral: 'abcd2345' }))
      .toBe('https://t.me/EfBazaarBot?start=ref_ABCD2345');
  });

  it('drops malformed codes instead of forwarding them to Telegram', () => {
    expect(telegramAppEntryHref('EfBazaarBot', { campaign: 'bad code!', referral: '<x>' }))
      .toBe('https://t.me/EfBazaarBot');
  });
});
