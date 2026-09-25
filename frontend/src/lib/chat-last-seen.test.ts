import { expect, it } from 'vitest';
import { formatLastSeen } from './chat-format';

const now = new Date('2026-09-25T10:00:00Z');
it.each([
  ['2026-09-25T09:59:40Z', 'Oxirgi faollik: hozirgina'],
  ['2026-09-25T09:55:00Z', 'Oxirgi faollik: 5 daqiqa oldin'],
  ['2026-09-25T08:00:00Z', 'Oxirgi faollik: 2 soat oldin'],
  ['2026-09-24T09:30:00Z', 'Oxirgi faollik: kecha 14:30'],
  ['2026-09-20T08:05:00Z', 'Oxirgi faollik: 20 sentabr 13:05'],
  ['2025-09-20T08:05:00Z', 'Oxirgi faollik: 20 sentabr 2025 13:05'],
  ['2026-09-25T10:00:10Z', 'Oxirgi faollik: hozirgina'],
  [null, 'Oflayn'],
  ['invalid', 'Oflayn'],
])('formats last seen %s', (value, expected) => {
  expect(formatLastSeen(value, now)).toBe(expected);
});
it('uses Uzbekistan calendar days at midnight', () => {
  expect(formatLastSeen('2026-09-23T19:30:00Z', new Date('2026-09-24T20:00:00Z')))
    .toBe('Oxirgi faollik: kecha 00:30');
});
