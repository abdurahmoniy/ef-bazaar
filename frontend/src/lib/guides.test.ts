import { describe, expect, it } from 'vitest';

import { buttonsAreValid, BUTTON_LABEL_MAX } from '@/lib/guides';

describe('buttonsAreValid', () => {
  it('to\'liq tugma qabul qilinadi', () => {
    expect(buttonsAreValid([{ label: "E'lon joylash", guideId: 'g1' }])).toBe(true);
  });

  it('yozuvsiz tugma rad etiladi', () => {
    // Botda bo'sh katak bo'lib chiqardi.
    expect(buttonsAreValid([{ label: '   ', guideId: 'g1' }])).toBe(false);
  });

  it('qo\'llanmasiz tugma rad etiladi', () => {
    // Bosilganda hech narsa kelmasdi va sabab ko'rinmasdi.
    expect(buttonsAreValid([{ label: 'Savdo', guideId: '' }])).toBe(false);
  });

  it('juda uzun yozuv rad etiladi', () => {
    // Telegram tugma matnini kesadi va yozuv tushunarsiz bo'lib qoladi.
    expect(buttonsAreValid([{ label: 'x'.repeat(BUTTON_LABEL_MAX + 1), guideId: 'g1' }]))
      .toBe(false);
  });

  it('bo\'sh ro\'yxat saqlanishi mumkin — barcha tugmalarni olib tashlash', () => {
    expect(buttonsAreValid([])).toBe(true);
  });
});
