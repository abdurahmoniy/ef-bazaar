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

  it('privacy policy explains how to delete the account', () => {
    expect(textOf('privacy')).toMatch(/akkauntni o‘chirish/i);
  });

  it('makes no promises the code cannot keep', () => {
    const all = `${textOf('oferta')}\n${textOf('privacy')}`;
    expect(all).not.toMatch(/100%|mutlaqo xavfsiz|hech qachon bloklanmaydi/i);
  });
});
