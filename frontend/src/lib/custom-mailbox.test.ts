import { describe, expect, it } from 'vitest';

import {
  claimView,
  efootballOffer,
  isPremiumDomainPlan,
  localPartProblem,
  normalizeLocalPart,
  type Availability,
} from './custom-mailbox';

const ok: Availability = { email: 'ali12@efbazaar.uz', available: true, reason: null, canClaim: true, claimBlock: null };

describe('normalizeLocalPart', () => {
  it('trims and lowercases', () => {
    expect(normalizeLocalPart('  AliBek ')).toBe('alibek');
  });
});

describe('localPartProblem', () => {
  it.each(['ali12', '12345', 'a1b2c3d4e5f6g7h8i9j0k1l2'])('accepts %s', (s) => {
    expect(localPartProblem(s)).toBeNull();
  });
  it.each(['ali', 'ali.bek', 'ali_bek', 'a1b2c3d4e5f6g7h8i9j0k1l2m', 'алибек'])('rejects %s', (s) => {
    expect(localPartProblem(s)).toBe('invalid');
  });
});

describe('claimView', () => {
  it('offers the claim when free and allowed', () => {
    const v = claimView({ localPart: 'ali12', checking: false, result: ok, plan: 'PRO' });
    expect(v.tone).toBe('ok');
    expect(v.message).toBe('Olishingiz mumkin');
    expect(v.action).toEqual({ kind: 'claim' });
  });

  it('shows the tick but sells Boyvachcha to Jaydari', () => {
    const v = claimView({ localPart: 'ali12', checking: false, result: { ...ok, canClaim: false, claimBlock: 'NO_SLOT' }, plan: 'STANDARD' });
    expect(v.tone).toBe('ok');
    expect(v.action).toEqual({ kind: 'upgrade', plan: 'PRO', label: 'Boyvachcha tarifida oling' });
  });

  it('sells Aristokrat for efootball.uz', () => {
    const v = claimView({
      localPart: 'ali12',
      checking: false,
      result: { ...ok, email: 'ali12@efootball.uz', canClaim: false, claimBlock: 'PLAN_DOMAIN' },
      plan: 'PRO',
    });
    expect(v.action).toEqual({ kind: 'upgrade', plan: 'MAX', label: 'Aristokrat tarifida oling' });
  });

  it('PRO with every slot used upsells Aristokrat', () => {
    const v = claimView({ localPart: 'ali12', checking: false, result: { ...ok, canClaim: false, claimBlock: 'NO_SLOT' }, plan: 'PRO' });
    expect(v.message).toBe('Barcha custom slotlar band');
    expect(v.action).toEqual({ kind: 'upgrade', plan: 'MAX', label: 'Aristokrat tarifida oling' });
  });

  it('MAX with every slot used has nowhere to go', () => {
    const v = claimView({ localPart: 'ali12', checking: false, result: { ...ok, canClaim: false, claimBlock: 'NO_SLOT' }, plan: 'MAX' });
    expect(v.message).toBe('Barcha custom slotlar band');
    expect(v.action).toEqual({ kind: 'none' });
  });

  it('explains the rule for a bad name without asking the server', () => {
    const v = claimView({ localPart: 'ali', checking: false, result: null, plan: 'PRO' });
    expect(v.tone).toBe('bad');
    expect(v.message).toBe('5–24 belgi, faqat lotin harf va raqam');
  });

  it('says nothing for an empty field', () => {
    expect(claimView({ localPart: '', checking: false, result: null, plan: 'PRO' })).toEqual({ tone: 'idle', message: '', action: { kind: 'none' } });
  });

  it('shows checking while the request is in flight', () => {
    expect(claimView({ localPart: 'ali12', checking: true, result: null, plan: 'PRO' }).tone).toBe('checking');
  });

  it.each([
    ['TAKEN', 'Band — boshqa nom tanlang'],
    ['RESERVED', 'Bu nom zahirada'],
    ['INVALID', '5–24 belgi, faqat lotin harf va raqam'],
    ['DOMAIN_NOT_ALLOWED', 'Bu domen ruxsat etilmagan'],
  ] as const)('%s', (reason, message) => {
    const v = claimView({ localPart: 'admin1', checking: false, result: { ...ok, email: 'admin1@efbazaar.uz', available: false, canClaim: false, reason }, plan: 'PRO' });
    expect(v.tone).toBe('bad');
    expect(v.message).toBe(message);
    expect(v.action).toEqual({ kind: 'none' });
  });

  it('ignores an answer for a name the user has since changed', () => {
    const v = claimView({ localPart: 'ali13', checking: false, result: ok, plan: 'PRO' });
    expect(v.tone).toBe('checking');
  });
});

describe('efootballOffer', () => {
  it('suggests efootball.uz below Aristokrat', () => {
    expect(efootballOffer('PRO', 'ali12')).toBe('ali12@efootball.uz ni ham olishingiz mumkin');
    expect(efootballOffer('STANDARD', 'ali12')).toBe('ali12@efootball.uz ni ham olishingiz mumkin');
  });
  it('is silent for Aristokrat, admins and bad names', () => {
    expect(efootballOffer('MAX', 'ali12')).toBeNull();
    expect(efootballOffer('STAFF', 'ali12')).toBeNull();
    expect(efootballOffer('PRO', 'ali')).toBeNull();
  });
});

describe('isPremiumDomainPlan', () => {
  it('is MAX and STAFF', () => {
    expect(isPremiumDomainPlan('MAX')).toBe(true);
    expect(isPremiumDomainPlan('STAFF')).toBe(true);
    expect(isPremiumDomainPlan('PRO')).toBe(false);
    expect(isPremiumDomainPlan(null)).toBe(false);
  });
});
