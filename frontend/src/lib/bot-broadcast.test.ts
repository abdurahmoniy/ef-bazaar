import { describe, expect, it } from 'vitest';

import {
  MAX_BUTTONS_PER_ROW,
  MAX_ROWS,
  addColumn,
  addRow,
  canAddColumn,
  canAddRow,
  removeButton,
  updateButton,
  validateButton,
  type InlineButtonRows,
} from './bot-broadcast';

const btn = (text: string) => ({ text, url: 'https://efbazaar.uz' });

describe('addColumn', () => {
  it('faqat aytilgan qatorga qo‘shadi', () => {
    const rows: InlineButtonRows = [[btn('a')], [btn('b')]];
    expect(addColumn(rows, 0, btn('yangi'))).toEqual([
      [btn('a'), btn('yangi')],
      [btn('b')],
    ]);
  });

  it('qator to‘lganda o‘zgartirmaydi', () => {
    const full: InlineButtonRows = [[btn('a'), btn('b'), btn('c')]];
    expect(addColumn(full, 0, btn('d'))).toBe(full);
  });

  it('kirish massivini o‘zgartirmaydi', () => {
    // React holatini joyida o'zgartirsak qayta chizilmaydi — panel
    // yangilanmagandek ko'rinadi.
    const rows: InlineButtonRows = [[btn('a')]];
    addColumn(rows, 0, btn('yangi'));
    expect(rows).toEqual([[btn('a')]]);
  });
});

describe('addRow', () => {
  it('eng pastga qo‘shadi', () => {
    expect(addRow([[btn('a')]], btn('b'))).toEqual([[btn('a')], [btn('b')]]);
  });

  it('chegaraga yetganda o‘zgartirmaydi', () => {
    const rows: InlineButtonRows = Array.from({ length: MAX_ROWS }, () => [btn('x')]);
    expect(addRow(rows, btn('y'))).toBe(rows);
  });
});

describe('removeButton', () => {
  it('faqat aytilgan tugmani o‘chiradi', () => {
    const rows: InlineButtonRows = [[btn('a'), btn('b')]];
    expect(removeButton(rows, { row: 0, col: 0 })).toEqual([[btn('b')]]);
  });

  it('bo‘shab qolgan qatorni ham olib tashlaydi', () => {
    // Bo'sh qator qolsa Telegram xabarni rad etadi, panelda esa hech
    // narsaga bog'lanmagan `+` osilib qolardi.
    const rows: InlineButtonRows = [[btn('a')], [btn('b')]];
    expect(removeButton(rows, { row: 0, col: 0 })).toEqual([[btn('b')]]);
  });

  it('oxirgi tugma o‘chganda bo‘sh massiv qoladi', () => {
    expect(removeButton([[btn('a')]], { row: 0, col: 0 })).toEqual([]);
  });
});

describe('updateButton', () => {
  it('boshqa qatorlarga tegmaydi', () => {
    const rows: InlineButtonRows = [[btn('a')], [btn('b')]];
    const next = updateButton(rows, { row: 1, col: 0 }, btn('yangi'));
    expect(next).toEqual([[btn('a')], [btn('yangi')]]);
  });
});

describe('cheklovlar', () => {
  it('qator to‘lganda ustun qo‘shib bo‘lmaydi', () => {
    expect(canAddColumn([[btn('a'), btn('b')]], 0)).toBe(true);
    expect(canAddColumn([[btn('a'), btn('b'), btn('c')]], 0)).toBe(false);
    expect(MAX_BUTTONS_PER_ROW).toBe(3);
  });

  it('mavjud bo‘lmagan qatorda ustun qo‘shib bo‘lmaydi', () => {
    expect(canAddColumn([], 0)).toBe(false);
  });

  it('qatorlar chegarasi', () => {
    expect(canAddRow([])).toBe(true);
    expect(canAddRow(Array.from({ length: MAX_ROWS }, () => [btn('x')]))).toBe(false);
  });
});

describe('validateButton', () => {
  it('to‘g‘ri tugmani qabul qiladi', () => {
    expect(validateButton({ text: 'Bozor', url: 'https://efbazaar.uz' })).toBeNull();
  });

  it('bo‘sh matnni rad etadi', () => {
    expect(validateButton({ text: '   ', url: 'https://efbazaar.uz' })).toContain('matn');
  });

  it('sxemasiz havolani rad etadi', () => {
    // Telegram yaroqsiz havolada BUTUN xabarni rad etadi — bitta tugma
    // butun ommaviy jo'natmani to'xtatib qo'yadi.
    expect(validateButton({ text: 'a', url: 'efbazaar.uz' })).toContain('https://');
  });

  it('javascript: havolasini rad etadi', () => {
    expect(validateButton({ text: 'a', url: 'javascript:alert(1)' })).toContain('https://');
  });

  it('tg:// havolasiga ruxsat beradi', () => {
    expect(validateButton({ text: 'a', url: 'tg://resolve?domain=efbazaar' })).toBeNull();
  });
});
