import { describe, expect, it } from 'vitest';

import { formatBytes, mailAvatarInitial, relativeUz } from './mail-format';

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
