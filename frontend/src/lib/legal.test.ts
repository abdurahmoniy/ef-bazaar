import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  LEGAL_DOCUMENTS,
  OFERTA_HREF,
  PRIVACY_HREF,
  TERMS_VERSION,
  needsTermsConsent,
} from './legal';
import { DISPUTE_RULES_HREF } from './help-data';

function textOf(slug: 'oferta' | 'privacy') {
  const doc = LEGAL_DOCUMENTS[slug];
  return [doc.title, doc.intro, ...doc.sections.flatMap((s) => [s.heading, ...s.paragraphs])].join('\n');
}

describe('terms consent', () => {
  it('asks a signed-in user who has not accepted the current version', () => {
    expect(needsTermsConsent({ termsVersion: null })).toBe(true);
    expect(needsTermsConsent({})).toBe(true);
    expect(needsTermsConsent({ termsVersion: '2000-01-01' })).toBe(true);
    expect(needsTermsConsent({ termsVersion: TERMS_VERSION })).toBe(false);
  });

  it('versions the documents by date so the backend accepts it', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LEGAL_DOCUMENTS.oferta.href).toBe(OFERTA_HREF);
    expect(LEGAL_DOCUMENTS.privacy.href).toBe(PRIVACY_HREF);
  });
});

describe('legal documents match how the platform works', () => {
  it('oferta keeps the guarantee that a buyer cannot take an account without paying', () => {
    expect(textOf('oferta')).toMatch(/xaridor akkountni olib pul to‘lamay ketishi mumkin emas/i);
  });

  it('oferta says a confirmed trade is final and the money is not returned', () => {
    expect(textOf('oferta')).toMatch(/tasdiqla[a-z‘]*\s.*qaytarilmaydi/i);
  });

  it('oferta refers to the dispute rules instead of restating a second rule set', () => {
    const links = LEGAL_DOCUMENTS.oferta.sections.flatMap((s) => s.links ?? []);
    expect(links.map((l) => l.href)).toContain(DISPUTE_RULES_HREF);
  });

  it('oferta states the real withdrawal rules', () => {
    expect(textOf('oferta')).toMatch(/10 000 so‘m/);
    expect(textOf('oferta')).toMatch(/administrator/i);
  });

  it('oferta states the real top-up rules', () => {
    expect(textOf('oferta')).toMatch(/1 000 so‘m/);
    expect(textOf('oferta')).toMatch(/15 daqiqa/);
  });

  it('oferta says buyer silence rejects the trade and returns the money', () => {
    // TradeStateMachine.smart(): WAITING_BUYER_VERIFY + TIMEOUT -> REJECTED.
    expect(textOf('oferta')).toMatch(/javob bermasa, savdo rad etilgan hisoblanadi/);
  });

  it('oferta describes who pays the fee in a sale and in an exchange', () => {
    // SALE: seller. SWAP: AdminFeePayer SELLER | BUYER | SPLIT.
    expect(textOf('oferta')).toMatch(/Sotuvda platforma komissiyasi sotuvchiga o‘tadigan summadan/);
    expect(textOf('oferta')).toMatch(/bir tomon yoki ikkalasi teng/);
  });

  it('oferta states the penalty ladder the trust service applies', () => {
    const text = textOf('oferta');
    expect(text).toMatch(/birinchisida ogohlantirish, uchinchisida 7 kunlik blok, beshinchisida doimiy blok/);
    expect(text).toMatch(/Uchta shikoyatingiz asossiz/);
  });

  it('oferta covers the paid plan, mailboxes and Konami risk', () => {
    const text = textOf('oferta');
    expect(text).toMatch(/Tarif uchun to‘langan pul qaytarilmaydi/);
    expect(text).toMatch(/o‘zi uzaymaydi/);
    expect(text).toMatch(/30 kun/);
    expect(text).toMatch(/Konami qoidalariga zid bo‘lishi mumkin/);
  });

  it('oferta does not describe the unused human trade-admin mode', () => {
    expect(textOf('oferta')).not.toMatch(/trade-admin|savdo-admin/i);
    expect(textOf('privacy')).not.toMatch(/trade-admin|savdo-admin/i);
  });

  it('oferta tells users to withdraw before deleting the account', () => {
    expect(textOf('oferta')).toMatch(/O‘chirishdan oldin[^.]*pulni yechib oling/);
  });

  it('uses "hisob" for the efBazaar account and "akkount" for the game account', () => {
    expect(`${textOf('oferta')}\n${textOf('privacy')}`).not.toMatch(/akkaunt/i);
  });

  it('oferta warns that store links cannot be removed', () => {
    expect(textOf('oferta')).toMatch(/olib tashlab bo‘lmaydi/);
  });

  it('privacy policy lists what is collected and what is public', () => {
    const text = textOf('privacy');
    for (const item of ['Telegram', 'Google', 'karta raqami', 'qora ro‘yxat', 'Yandex Metrika']) {
      expect(text).toContain(item);
    }
    expect(text).toMatch(/shifrlangan/);
  });

  it('privacy policy explains how to delete the account and what stays', () => {
    const text = textOf('privacy');
    expect(text).toMatch(/hisobni o‘chirish/i);
    // Chatlar, savdo va to'lov tarixi o'chirilmaydi (UserDeletedConsumer,
    // payment/trade user-deleted ni tinglamaydi) — va'da ham berilmasin.
    expect(text).not.toMatch(/chatlar[^.]*tozalanadi/i);
    expect(text).toMatch(/o‘chirilgandan keyin ham saqlanadi/i);
  });

  it('privacy policy lists every kind of data the services store', () => {
    const text = textOf('privacy');
    for (const item of [
      'Konami ID', 'karta egasining ismi', 'telefon raqami', 'Pochta qutilari',
      'IP manzil', 'qurilma tokeni', 'kampaniya', 'tavsiya',
    ]) {
      expect(text).toContain(item);
    }
  });

  it('privacy policy names every outside service that receives data', () => {
    const text = textOf('privacy');
    for (const item of ['Telegram', 'Google', 'Firebase', 'Yandex Metrika', 'YouTube']) {
      expect(text).toContain(item);
    }
    expect(text).toMatch(/O‘zbekistondan tashqarida/);
  });

  it('privacy policy does not claim the blacklist publishes identifiers', () => {
    // BlacklistEntryResponse: displayName, penaltyType, reason, count, dates.
    expect(textOf('privacy')).toMatch(/telefon raqam ommaga chiqarilmaydi/);
    expect(textOf('privacy')).toMatch(/administrator[a-z]*:[^.]*chat/i);
  });

  it('discloses session recording for as long as Webvisor is on', () => {
    const layout = readFileSync(join(__dirname, '../app/layout.tsx'), 'utf8');
    const recording = /webvisor:\s*true/.test(layout);
    const disclosed = /harakatlaringizni ham yozib oladi/.test(textOf('privacy'));
    expect(disclosed).toBe(recording);
  });

  it('makes no promises the code cannot keep', () => {
    const all = `${textOf('oferta')}\n${textOf('privacy')}`;
    expect(all).not.toMatch(/100%|mutlaqo xavfsiz|hech qachon bloklanmaydi/i);
  });
});
