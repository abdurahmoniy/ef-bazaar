import type { PlanCode } from './plans';

/**
 * Custom (self-named) mailboxes: name rules and what the claim screen shows.
 *
 * The server is the authority — reserved names, taken names and the plan's
 * slots are only known there. The client checks the format so a bad name
 * gets its explanation without a request.
 */

export const CUSTOM_LOCAL_PART = /^[a-z0-9]{5,24}$/;
export const DEFAULT_DOMAIN = 'efbazaar.uz';
export const PREMIUM_DOMAIN = 'efootball.uz';

const RULE = '5–24 belgi, faqat lotin harf va raqam';

export type AvailabilityReason = 'TAKEN' | 'RESERVED' | 'INVALID' | 'DOMAIN_NOT_ALLOWED';
export type ClaimBlock = 'PLAN_DOMAIN' | 'NO_SLOT';

export type Availability = {
  email: string;
  available: boolean;
  reason: AvailabilityReason | null;
  canClaim: boolean;
  claimBlock: ClaimBlock | null;
};

export type ClaimAction =
  | { kind: 'claim' }
  | { kind: 'upgrade'; plan: 'PRO' | 'MAX'; label: string }
  | { kind: 'none' };

export type ClaimView = {
  tone: 'idle' | 'checking' | 'ok' | 'bad';
  message: string;
  action: ClaimAction;
};

export type CustomMailbox = {
  id: string;
  email: string;
  provisioned: boolean;
  locked: boolean;
  linkedAccountId: string | null;
  activeSessionId: string | null;
  createdAt: string;
};

export function normalizeLocalPart(raw: string): string {
  return raw.trim().toLowerCase();
}

export function localPartProblem(localPart: string): 'invalid' | null {
  return CUSTOM_LOCAL_PART.test(localPart) ? null : 'invalid';
}

export function isPremiumDomainPlan(plan: PlanCode | null): boolean {
  return plan === 'MAX' || plan === 'STAFF';
}

const REASON_TEXT: Record<AvailabilityReason, string> = {
  TAKEN: 'Band — boshqa nom tanlang',
  RESERVED: 'Bu nom zahirada',
  INVALID: RULE,
  DOMAIN_NOT_ALLOWED: 'Bu domen ruxsat etilmagan',
};

const NONE: ClaimAction = { kind: 'none' };
const TO_PRO: ClaimAction = { kind: 'upgrade', plan: 'PRO', label: 'Boyvachcha tarifida oling' };
const TO_MAX: ClaimAction = { kind: 'upgrade', plan: 'MAX', label: 'Aristokrat tarifida oling' };

/**
 * What the claim card says for the name in the field.
 *
 * `result` may answer an older name (the user kept typing); it then counts as
 * still checking, so a stale ✓ never sits under a different name.
 */
export function claimView(input: {
  localPart: string;
  checking: boolean;
  result: Availability | null;
  plan: PlanCode | null;
}): ClaimView {
  const local = normalizeLocalPart(input.localPart);
  if (!local) return { tone: 'idle', message: '', action: NONE };
  if (localPartProblem(local)) return { tone: 'bad', message: RULE, action: NONE };
  const result = input.result;
  if (input.checking || !result || result.email.split('@')[0] !== local) {
    return { tone: 'checking', message: 'Tekshirilmoqda…', action: NONE };
  }
  if (!result.available) {
    return { tone: 'bad', message: REASON_TEXT[result.reason ?? 'INVALID'], action: NONE };
  }
  if (result.canClaim) return { tone: 'ok', message: 'Olishingiz mumkin', action: { kind: 'claim' } };
  if (result.claimBlock === 'PLAN_DOMAIN') {
    return { tone: 'ok', message: 'Olishingiz mumkin', action: TO_MAX };
  }
  if (input.plan === 'STANDARD' || input.plan === null) {
    return { tone: 'ok', message: 'Olishingiz mumkin', action: TO_PRO };
  }
  return {
    tone: 'ok',
    message: 'Barcha custom slotlar band',
    action: input.plan === 'PRO' ? TO_MAX : NONE,
  };
}

/** The upsell under the card for plans that cannot use efootball.uz. */
export function efootballOffer(plan: PlanCode | null, localPart: string): string | null {
  const local = normalizeLocalPart(localPart);
  if (isPremiumDomainPlan(plan) || localPartProblem(local)) return null;
  return `${local}@${PREMIUM_DOMAIN} ni ham olishingiz mumkin`;
}
