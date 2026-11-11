import { describe, expect, it } from 'vitest';
import { DISPUTE_RULES_ID, HELP_CATEGORIES, HELP_ITEMS, searchHelpItems } from './help-data';
import { LEGAL_DOCUMENTS } from './legal';

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

describe('help content is written in one plain Uzbek voice', () => {
  const VISIBLE = [
    ...HELP_CATEGORIES.flatMap((c) => [c.label, c.shortLabel, c.description]),
    ...HELP_ITEMS.flatMap((i) => [i.title, i.summary, ...i.content, i.actionLabel ?? '']),
  ].join('\n');

  it('uses one term per concept', () => {
    // Muqobillari faqat qidiruv teglarida qoladi.
    for (const banned of [
      /escrow/i, /blacklist/i, /\bP2P\b/, /WebApp/i, /doplata/i, /\bobmen/i,
      /diviziyon/i, /eFBazaar/, /\bbitim/i, /akkaunt/i, /lahzali/i, /\bFAQ\b/, /Smart Admin/i,
    ]) {
      expect(VISIBLE).not.toMatch(banned);
    }
  });

  it('has no emoji bullets and no "?:" labels', () => {
    expect(VISIBLE).not.toMatch(/[\u2705\u274C]/u);
    expect(VISIBLE).not.toMatch(/\?:/);
  });

  it('labels one destination with one button text', () => {
    const labels = new Map<string, Set<string>>();
    for (const item of HELP_ITEMS) {
      if (!item.actionUrl || !item.actionLabel) continue;
      labels.set(item.actionUrl, (labels.get(item.actionUrl) ?? new Set()).add(item.actionLabel));
    }
    for (const [url, set] of labels) {
      expect([...set], url).toHaveLength(1);
    }
  });

  it('does not describe the unused human trade-admin mode', () => {
    expect(VISIBLE).not.toMatch(/trade-admin|savdo-admin|admin qo‘shilgani/i);
  });
});

describe('help and oferta state the same rules', () => {
  const oferta = LEGAL_DOCUMENTS.oferta.sections.flatMap((s) => s.paragraphs).join('\n');

  it('agrees on money limits', () => {
    for (const amount of ['1 000 so‘m', '10 000 so‘m']) {
      expect(ALL_TEXT).toContain(amount);
      expect(oferta).toContain(amount);
    }
    expect(textOf('how-to-top-up-wallet')).toContain('15 daqiqa');
    expect(oferta).toContain('15 daqiqa');
  });

  it('agrees on the penalty ladder', () => {
    for (const text of [textOf(DISPUTE_RULES_ID), oferta]) {
      expect(text).toMatch(/7 kunlik blok/);
      expect(text).toMatch(/doimiy blok/);
      expect(text).toMatch(/uchta shikoyatingiz/i);
    }
  });

  it('agrees that the paid plan is not refunded and does not renew itself', () => {
    for (const text of [textOf('faq-pro-plan'), oferta]) {
      expect(text).toMatch(/Tarif uchun to‘langan pul qaytarilmaydi/);
      expect(text).toMatch(/o‘zi uzaymaydi/);
    }
  });

  it('explains the exchange fee the same way', () => {
    expect(textOf('exchange-modes-explained')).toMatch(/bir tomon yoki ikkalasi teng/);
    expect(oferta).toMatch(/bir tomon yoki ikkalasi teng/);
  });

  it('never promises that deleting the account erases chats or payments', () => {
    expect(textOf('faq-delete-account')).toMatch(/saqlanib qoladi/);
    expect(textOf('faq-delete-account')).toMatch(/pulni kartangizga yechib oling/);
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
