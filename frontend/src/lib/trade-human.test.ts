import { describe, expect, it } from 'vitest';

import {
  formatDurationUz,
  humanStepCompletion,
  isHumanProposal,
  isHumanTrade,
  isTradeAdmin,
  validateAdminFee,
} from './trade-human';
import type { TradeAdminCardResponse, TradeResponse, TradeStepResponse } from './trade-types';
import type { User } from './types';

describe('human trade helpers', () => {
  it('detects human trades from explicit mode or human-only states', () => {
    const base = {
      id: 't1',
      state: 'WAITING_PAYMENT',
      sellerId: 'seller',
      buyerId: 'buyer',
      priceUzs: 1,
      mailboxId: null,
      mailboxEmail: null,
      chatId: null,
      createdAt: '2026-08-08T00:00:00Z',
      expiresAt: null,
      stateDeadline: null,
      role: 'SELLER',
      passwordMessageId: null,
      emailChangeVerificationCode: null,
    } satisfies TradeResponse;

    expect(isHumanTrade({ ...base, mode: 'HUMAN' })).toBe(true);
    expect(isHumanTrade({ ...base, state: 'IN_PROGRESS' })).toBe(true);
    expect(isHumanTrade({ ...base, mode: 'SMART' })).toBe(false);
  });

  it('validates the selected admin fee against the published band and busy state', () => {
    const admin = {
      userId: 'admin',
      displayName: 'Admin',
      photoAvailable: false,
      averageStars: 4.8,
      ratingCount: 12,
      averageWorkSeconds: 3600,
      minFeeUzs: 20000,
      maxFeeUzs: 50000,
      online: true,
      lastSeenAt: null,
      activeTrades: 1,
      maxConcurrentTrades: 3,
      busy: false,
    } satisfies TradeAdminCardResponse;

    expect(validateAdminFee(admin, 19999)).toEqual({
      ok: false,
      error: "Admin xizmat narxi 20 000 so'm dan kam bo'lmasligi kerak",
    });
    expect(validateAdminFee(admin, 50001)).toEqual({
      ok: false,
      error: "Admin xizmat narxi 50 000 so'm dan oshmasligi kerak",
    });
    expect(validateAdminFee({ ...admin, busy: true }, 30000)).toEqual({
      ok: false,
      error: 'Bu admin hozir band',
    });
    expect(validateAdminFee(admin, 30000)).toEqual({ ok: true });
  });

  it('counts completed checklist steps', () => {
    const steps = [
      { step: 'SELLER_BRIEFED', labelUz: 'a', completed: true, completedAt: 'x', note: null },
      { step: 'ACCOUNT_TRANSFERRED', labelUz: 'b', completed: false, completedAt: null, note: null },
    ] satisfies TradeStepResponse[];

    expect(humanStepCompletion(steps)).toEqual({ completed: 1, total: 2, allDone: false });
    expect(humanStepCompletion(steps.map((step) => ({ ...step, completed: true })))).toEqual({
      completed: 2,
      total: 2,
      allDone: false,
    });
  });

  it('requires all six checklist steps before close is enabled', () => {
    const completedSteps = [
      'SELLER_BRIEFED',
      'ACCOUNT_TRANSFERRED',
      'ACCOUNT_VERIFIED',
      'PAYMENT_RECEIVED',
      'CREDENTIALS_DELIVERED',
      'SELLER_PAID',
    ].map((step) => ({
      step,
      labelUz: step,
      completed: true,
      completedAt: '2026-08-08T00:00:00Z',
      note: null,
    })) as TradeStepResponse[];

    expect(humanStepCompletion(completedSteps.slice(0, 5))).toEqual({
      completed: 5,
      total: 5,
      allDone: false,
    });
    expect(humanStepCompletion(completedSteps)).toEqual({
      completed: 6,
      total: 6,
      allDone: true,
    });
  });

  it('detects human proposals from mode or admin assignment fields', () => {
    expect(isHumanProposal({ mode: 'HUMAN' })).toBe(true);
    expect(isHumanProposal({ adminId: 'admin-1' })).toBe(true);
    expect(isHumanProposal({ adminFeeUzs: 30000 })).toBe(true);
    expect(isHumanProposal({ mode: 'SMART' })).toBe(false);
    expect(isHumanProposal({})).toBe(false);
  });

  it('formats durations for countdowns and work-time metrics', () => {
    expect(formatDurationUz(59)).toBe('59 soniya');
    expect(formatDurationUz(61)).toBe('1 daqiqa');
    expect(formatDurationUz(3660)).toBe('1 soat 1 daqiqa');
    expect(formatDurationUz(90000)).toBe('1 kun 1 soat');
  });

  it('recognizes trade admin roles defensively', () => {
    const user = { roles: ['ROLE_USER', 'ROLE_TRADE_ADMIN'] } as User;
    expect(isTradeAdmin(user)).toBe(true);
    expect(isTradeAdmin({ roles: ['TRADE_ADMIN'] } as User)).toBe(true);
    expect(isTradeAdmin({ roles: ['ROLE_USER'] } as User)).toBe(false);
  });
});
