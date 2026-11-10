import { describe, expect, it } from 'vitest';
import { DISPUTE_RULES_ID, HELP_CATEGORIES, HELP_ITEMS, searchHelpItems } from './help-data';

function textOf(id: string): string {
  const item = HELP_ITEMS.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`help item ${id} is missing`);
  return [item.title, item.summary, ...item.content].join('\n');
}

const ALL_TEXT = HELP_ITEMS.map((item) => textOf(item.id)).join('\n');

// Yordam markazi nizoda dalil bo'ladi: foydalanuvchi "saytda shunday
// yozilgan" deydi. Shuning uchun matn platforma aslida qanday ishlashiga
// mos bo'lishi shart.
describe('help content matches how the platform works', () => {
  it('publishes the dispute rules as a featured safety article', () => {
    const item = HELP_ITEMS.find((candidate) => candidate.id === DISPUTE_RULES_ID);
    expect(item?.category).toBe('safety');
    expect(item?.featured).toBe(true);
    expect(item?.actionUrl).toBe('/support');
    const body = textOf(DISPUTE_RULES_ID);
    expect(body).toContain('Rad etish');
    expect(body).toContain('24 soat');
    expect(body).toContain('Shikoyat');
    expect(body).toMatch(/7 kunlik blok/);
    expect(body).toMatch(/qora ro.yxat/i);
  });

  it('tells the buyer not to change the account while verifying it', () => {
    expect(textOf('how-escrow-works')).not.toMatch(/barcha ma.lumotlarni o.zgartiradi/);
    expect(textOf('how-escrow-works')).toMatch(/tekshiruv paytida/i);
  });

  it('never promises that an admin reverses a confirmed trade', () => {
    expect(ALL_TEXT).not.toMatch(/haqli tomonga mablag/);
    expect(textOf('100-percent-secure-trade-guarantee')).toMatch(/ortga qaytarib bo.lmaydi/);
  });

  it('keeps the guarantee that a buyer cannot keep an account without paying', () => {
    expect(textOf('100-percent-secure-trade-guarantee')).toMatch(/akkountni olib pul to.lamay/);
  });

  it('treats Google Play and Game Center links as permanent', () => {
    expect(textOf('konami-id-transfer-guide')).not.toMatch(/ulanishlarni uzish/);
    expect(textOf('konami-id-transfer-guide')).toMatch(/olib tashlab bo.lmaydi/);
  });

  it('describes chats as permanent', () => {
    expect(ALL_TEXT).not.toMatch(/avtomatik yopiladi/);
  });

  it('contains no invented statistics', () => {
    expect(ALL_TEXT).not.toMatch(/barobar/);
  });

  it('describes top-up as a transfer of the exact invoice amount', () => {
    expect(textOf('how-to-top-up-wallet')).not.toMatch(/SMS/);
    expect(textOf('how-to-top-up-wallet')).toMatch(/aniq summa/);
  });

  it('states the real withdrawal rules', () => {
    expect(textOf('how-to-withdraw-funds')).not.toMatch(/15-60/);
    expect(textOf('how-to-withdraw-funds')).toContain('10 000');
    expect(textOf('how-to-withdraw-funds')).toMatch(/bitta ochiq so.rov/);
  });

  it('sends users to the in-app support chat', () => {
    expect(HELP_ITEMS.find((item) => item.id === 'faq-support-contact')?.actionUrl).toBe('/support');
  });

  it('describes the Gamer Card fields that actually exist', () => {
    expect(textOf('gamer-card-setup')).not.toMatch(/Konami ID \(ixtiyoriy\)/);
    expect(textOf('gamer-card-setup')).toMatch(/turnir/i);
  });
});

describe('help-data', () => {
  it('has all required categories with icons and descriptions', () => {
    expect(HELP_CATEGORIES.length).toBeGreaterThanOrEqual(6);
    const categoryIds = HELP_CATEGORIES.map((c) => c.id);
    expect(categoryIds).toContain('all');
    expect(categoryIds).toContain('start');
    expect(categoryIds).toContain('safety');
    expect(categoryIds).toContain('buyer');
    expect(categoryIds).toContain('seller');
    expect(categoryIds).toContain('wallet');
    expect(categoryIds).toContain('faq');
  });

  it('contains well-structured help items across categories', () => {
    expect(HELP_ITEMS.length).toBeGreaterThanOrEqual(10);
    for (const item of HELP_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.summary).toBeTruthy();
      expect(item.content.length).toBeGreaterThan(0);
      expect(item.tags.length).toBeGreaterThan(0);
    }
  });

  it('filters items correctly by category', () => {
    const safetyItems = searchHelpItems('', 'safety');
    expect(safetyItems.length).toBeGreaterThan(0);
    expect(safetyItems.every((item) => item.category === 'safety')).toBe(true);

    const allItems = searchHelpItems('', 'all');
    expect(allItems.length).toBe(HELP_ITEMS.length);
  });

  it('searches items by keyword matching title, summary, content, or tags', () => {
    const konamiResults = searchHelpItems('konami');
    expect(konamiResults.length).toBeGreaterThan(0);

    const escrowResults = searchHelpItems('garov');
    expect(escrowResults.length).toBeGreaterThan(0);

    const emptyResults = searchHelpItems('xyznonexistentterm9999');
    expect(emptyResults).toHaveLength(0);
  });

  it('combines category filter and query filter', () => {
    const results = searchHelpItems('konami', 'safety');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((item) => item.category === 'safety')).toBe(true);

    const noMatches = searchHelpItems('konami', 'wallet');
    expect(noMatches).toHaveLength(0);
  });
});
