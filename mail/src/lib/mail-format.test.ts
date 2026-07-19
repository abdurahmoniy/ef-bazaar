import { describe, expect, it } from 'vitest';

import {
  extractOtpCode,
  formatBytes,
  fullDateUz,
  listTimeUz,
  mailAvatarColor,
  mailAvatarInitial,
  relativeUz,
  stripHtml,
} from './mail-format';

describe('mail-format', () => {
  describe('relativeUz', () => {
    it('returns em-dash for null / undefined / invalid dates', () => {
      expect(relativeUz(null)).toBe('—');
      expect(relativeUz(undefined)).toBe('—');
      expect(relativeUz('not a date')).toBe('—');
    });

    it('returns "hozir" for very recent timestamps', () => {
      const now = new Date('2026-07-17T12:00:00Z');
      const t = new Date('2026-07-17T11:59:31Z');
      expect(relativeUz(t.toISOString(), now)).toBe('hozir');
    });

    it('returns "N daqiqa oldin" under an hour', () => {
      const now = new Date('2026-07-17T12:00:00Z');
      const t = new Date('2026-07-17T11:55:00Z');
      expect(relativeUz(t.toISOString(), now)).toBe('5 daqiqa oldin');
    });

    it('returns "N soat oldin" under a day', () => {
      const now = new Date('2026-07-17T12:00:00Z');
      const t = new Date('2026-07-17T09:00:00Z');
      expect(relativeUz(t.toISOString(), now)).toBe('3 soat oldin');
    });

    it('returns Uzbek month/day for older dates in the same year', () => {
      const now = new Date('2026-07-17T12:00:00Z');
      const t = new Date('2026-05-10T09:00:00Z');
      // UZ time = +5 → 10 May stays as "10 may".
      expect(relativeUz(t.toISOString(), now)).toBe('10 may');
    });

    it('includes year for older-than-current-year dates', () => {
      const now = new Date('2026-07-17T12:00:00Z');
      const t = new Date('2024-12-31T05:00:00Z');
      expect(relativeUz(t.toISOString(), now)).toBe('31 dekabr 2024');
    });
  });

  describe('formatBytes', () => {
    it('renders bytes below 1KiB literally', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
    });

    it('renders KiB / MiB with one decimal', () => {
      expect(formatBytes(2048)).toBe('2.0 KB');
      expect(formatBytes(1024 * 1024 * 3)).toBe('3.0 MB');
    });
  });

  describe('fullDateUz', () => {
    it('renders UZ-time absolute stamp', () => {
      // 09:00 UTC → 14:00 UZ (+5)
      expect(fullDateUz('2026-07-17T09:00:00Z')).toBe('17 iyul 2026, 14:00');
    });

    it('pads minutes and hours', () => {
      // 23:05 UTC → 04:05 next day UZ
      expect(fullDateUz('2026-07-17T23:05:00Z')).toBe('18 iyul 2026, 04:05');
    });

    it('returns em-dash for null / invalid input', () => {
      expect(fullDateUz(null)).toBe('—');
      expect(fullDateUz('nope')).toBe('—');
    });
  });

  describe('stripHtml', () => {
    it('strips tags and decodes common entities', () => {
      expect(stripHtml('<p>Salom &amp; xush kelibsiz</p>').trim()).toBe(
        'Salom & xush kelibsiz',
      );
    });

    it('turns block boundaries into newlines', () => {
      const text = stripHtml('<p>Your code:</p><p>482913</p>');
      expect(text).toContain('\n');
      expect(text).toContain('482913');
    });
  });

  describe('extractOtpCode', () => {
    it('finds a code on the same line as the keyword', () => {
      expect(extractOtpCode('Your verification code is 482913', null)).toBe('482913');
    });

    it('finds a code on the line below the label (Konami layout)', () => {
      expect(extractOtpCode('認証コード:\n\n7261\n\nこのコードは10分間有効です', null)).toBe('7261');
    });

    it('reads the code out of sanitised HTML when plain is missing', () => {
      expect(
        extractOtpCode(null, '<p>Tasdiqlash kodi:</p><p><b>558201</b></p>'),
      ).toBe('558201');
    });

    it('skips bare years in favour of a real code', () => {
      expect(
        extractOtpCode('© 2026 KONAMI — your code 4821 expires soon', null),
      ).toBe('4821');
    });

    it('falls back to a standalone digit line', () => {
      expect(extractOtpCode('Assalomu alaykum\n\n930127\n\nRahmat', null)).toBe('930127');
    });

    it('returns null when nothing code-like exists', () => {
      expect(extractOtpCode('Hech qanday raqam yo\'q bu xatda.', null)).toBeNull();
      expect(extractOtpCode(null, null)).toBeNull();
    });

    it('ignores long numbers like phone numbers embedded in digits', () => {
      expect(extractOtpCode('Call +998901234567 for help', null)).toBeNull();
    });
  });

  describe('listTimeUz', () => {
    it('returns UZ-time clock for same-day timestamps', () => {
      const now = new Date('2026-07-17T12:00:00Z');
      // 04:05 UTC → 09:05 UZ, same UZ day.
      expect(listTimeUz('2026-07-17T04:05:00Z', now)).toBe('09:05');
    });

    it('respects the UZ day boundary, not the UTC one', () => {
      const now = new Date('2026-07-17T12:00:00Z');
      // 20:30 UTC on the 16th → 01:30 UZ on the 17th → same UZ day → clock.
      expect(listTimeUz('2026-07-16T20:30:00Z', now)).toBe('01:30');
    });

    it('returns day + month for older same-year dates', () => {
      const now = new Date('2026-07-17T12:00:00Z');
      expect(listTimeUz('2026-05-10T09:00:00Z', now)).toBe('10 may');
    });

    it('appends the year for older years', () => {
      const now = new Date('2026-07-17T12:00:00Z');
      expect(listTimeUz('2024-12-31T05:00:00Z', now)).toBe('31 dekabr 2024');
    });

    it('returns em-dash for null / invalid input', () => {
      expect(listTimeUz(null)).toBe('—');
      expect(listTimeUz('nope')).toBe('—');
    });
  });

  describe('mailAvatarColor', () => {
    it('is deterministic for the same address', () => {
      expect(mailAvatarColor('carla@efbazaar.uz')).toBe(mailAvatarColor('carla@efbazaar.uz'));
    });

    it('returns a css hsl() color', () => {
      expect(mailAvatarColor('zeb@example.com')).toMatch(/^hsl\(/);
    });
  });

  describe('mailAvatarInitial', () => {
    it('returns uppercase first letter of the local-part', () => {
      expect(mailAvatarInitial('carla@efbazaar.uz')).toBe('C');
      expect(mailAvatarInitial('zeb@example.com')).toBe('Z');
    });

    it('falls back to ? on empty input', () => {
      expect(mailAvatarInitial('')).toBe('?');
    });

    it('handles addresses without @', () => {
      expect(mailAvatarInitial('root')).toBe('R');
    });
  });
});
