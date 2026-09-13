import { describe, expect, it } from 'vitest';

import {
  buttonsAreValid,
  guideVideoUrl,
  resolveGuideCategory,
  BUTTON_LABEL_MAX,
} from '@/lib/guides';

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

describe('guideVideoUrl', () => {
  it('to\'g\'ri URL shakllantiradi', () => {
    expect(guideVideoUrl('video-123')).toBe('/api/video/video-123');
  });

  it('bo\'sh fileId bo\'lsa bo\'sh qator qaytaradi', () => {
    expect(guideVideoUrl('   ')).toBe('');
  });
});

describe('resolveGuideCategory', () => {
  it('aniq toifa ko\'rsatilgan bo\'lsa o\'shani qaytaradi', () => {
    expect(resolveGuideCategory({ title: 'Video', description: 'Test', category: 'safety' })).toBe('safety');
    expect(resolveGuideCategory({ title: 'Video', description: 'Test', category: 'wallet' })).toBe('wallet');
    expect(resolveGuideCategory({ title: 'Video', description: 'Test', category: 'seller' })).toBe('seller');
  });

  it('toifa bo\'lmasa kalit so\'zlar bo\'yicha xavfsizlik toifasini aniqlaydi', () => {
    expect(
      resolveGuideCategory({
        title: 'Garov bitimi qanday ishlaydi',
        description: 'Xavfsiz escrow orqali savdo',
        category: null,
      }),
    ).toBe('safety');
  });

  it('toifa bo\'lmasa kalit so\'zlar bo\'yicha sotuvchi toifasini aniqlaydi', () => {
    expect(
      resolveGuideCategory({
        title: 'E\'lon qanday joylanadi',
        description: 'Akkountni sotish bo\'yicha qo\'llanma',
        category: null,
      }),
    ).toBe('seller');
  });

  it('toifa bo\'lmasa kalit so\'zlar bo\'yicha hamyon toifasini aniqlaydi', () => {
    expect(
      resolveGuideCategory({
        title: 'Balansni to\'ldirish',
        description: 'Uzcard va Humo orqali to\'lov qilish',
        category: null,
      }),
    ).toBe('wallet');
  });

  it('toifa bo\'lmasa kalit so\'zlar bo\'yicha xaridor toifasini aniqlaydi', () => {
    expect(
      resolveGuideCategory({
        title: 'Akkount qidiruv va tanlash',
        description: 'Xaridor uchun o\'yinchilarni topish',
        category: null,
      }),
    ).toBe('buyer');
  });

  it('mos kalit so\'z bo\'lmasa default "start" qaytaradi', () => {
    expect(
      resolveGuideCategory({
        title: 'Platforma imkoniyatlari',
        description: 'Umumiy ma\'lumotlar',
        category: null,
      }),
    ).toBe('start');
  });
});
