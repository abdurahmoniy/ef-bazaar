import { describe, expect, it } from 'vitest';

import {
  canSubmitTradeAdminApplication,
  tradeAdminApplicationStatusBadge,
  tradeAdminApplicationStatusText,
  type TradeAdminApplicationResponse,
} from './trade-admin-applications';

const pendingApplication = {
  id: 'app-1',
  applicantUserId: 'user-1',
  applicantName: 'Ali',
  status: 'PENDING',
  reason: 'Men xavfsiz savdolarga yordam beraman',
  contact: '@ali',
  createdAt: '2026-08-08T00:00:00Z',
} satisfies TradeAdminApplicationResponse;

describe('trade admin application helpers', () => {
  it('blocks duplicate submission while an application is pending', () => {
    expect(canSubmitTradeAdminApplication(false, pendingApplication)).toBe(false);
    expect(tradeAdminApplicationStatusText(pendingApplication)).toBe(
      "Arizangiz ko'rib chiqilmoqda",
    );
  });

  it('allows resubmission after rejection', () => {
    const rejected = {
      ...pendingApplication,
      status: 'REJECTED',
      decisionNote: "Avval ko'proq savdo tarixi kerak",
      reviewedAt: '2026-08-08T01:00:00Z',
    } satisfies TradeAdminApplicationResponse;

    expect(canSubmitTradeAdminApplication(false, rejected)).toBe(true);
    expect(tradeAdminApplicationStatusText(rejected)).toBe(
      "Rad etildi: Avval ko'proq savdo tarixi kerak",
    );
  });

  it('shows approved state as workspace-ready', () => {
    const approved = {
      ...pendingApplication,
      status: 'APPROVED',
      reviewedAt: '2026-08-08T01:00:00Z',
    } satisfies TradeAdminApplicationResponse;

    expect(canSubmitTradeAdminApplication(true, approved)).toBe(false);
    expect(tradeAdminApplicationStatusText(approved)).toBe(
      'Inson adminlik tasdiqlangan',
    );
  });

  it('maps statuses to compact admin badges', () => {
    expect(tradeAdminApplicationStatusBadge('PENDING')).toEqual({
      label: 'Kutilmoqda',
      variant: 'warn',
    });
    expect(tradeAdminApplicationStatusBadge('APPROVED')).toEqual({
      label: 'Tasdiqlangan',
      variant: 'verified',
    });
    expect(tradeAdminApplicationStatusBadge('REJECTED')).toEqual({
      label: 'Rad etilgan',
      variant: 'danger',
    });
  });
});
