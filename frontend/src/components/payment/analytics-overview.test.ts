// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AnalyticsOverview } from './analytics-overview';
import type { PaymentAnalyticsOverview } from '@/lib/payment-types';

/** Explicit escape — never assert a literal invisible character. See money.test.ts. */
const NBSP = '\u00A0';

function overview(patch: Partial<PaymentAnalyticsOverview> = {}): PaymentAnalyticsOverview {
  return {
    ledgerCardsTiyin: 1_000_000,
    observedCardsTiyin: 1_000_000,
    unobservedCards: 0,
    userAvailableTiyin: 700_000,
    userHeldTiyin: 100_000,
    userWithdrawPendingTiyin: 100_000,
    usersTotalTiyin: 900_000,
    platformOwnTiyin: 100_000,
    revenueInTiyin: 150_000,
    revenueOutTiyin: 40_000,
    feesTiyin: 10_000,
    netTiyin: 100_000,
    referralRewardTiyin: 40_000,
    referralPayouts: 4,
    referralRecipients: 3,
    revenueByKind: [
      { kind: 'TRADE_SETTLE', inTiyin: 150_000, outTiyin: 0 },
      { kind: 'REFERRAL_REWARD', inTiyin: 0, outTiyin: 40_000 },
    ],
    cardThroughput: [],
    computedAt: '2026-09-10T12:00:00Z',
    ...patch,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(data: PaymentAnalyticsOverview) {
  await act(async () => root.render(createElement(AnalyticsOverview, { data })));
}

describe('AnalyticsOverview', () => {
  it('leads with the total on the cards and who it belongs to', async () => {
    await render(overview());
    const text = container.textContent ?? '';

    expect(text).toContain(`10${NBSP}000`);
    expect(text).toContain('Foydalanuvchilar puli');
    expect(text).toContain('Platformaning o‘zi');
  });

  it('confirms the cards hold what the ledger says', async () => {
    await render(overview());
    expect(container.textContent).toContain('Userbot ko‘rgan qoldiq bilan mos');
  });

  it('names the difference when the cards and the books disagree', async () => {
    await render(overview({ observedCardsTiyin: 980_000 }));
    expect(container.textContent).toContain('Userbot ko‘rgan qoldiq kam');
  });

  it('declines to compare while a card has never reported', async () => {
    await render(overview({ unobservedCards: 2, observedCardsTiyin: 400_000 }));
    expect(container.textContent).toContain('solishtirib bo‘lmaydi');
  });

  /**
   * The reason this dashboard exists. A loss is a business state — the platform
   * funds referrals out of its own share on purpose — so it is drawn with the
   * same ink as a profit and carries no warning styling.
   */
  it('shows a loss plainly, with no alert role and no destructive styling', async () => {
    await render(overview({ netTiyin: -30_000, revenueInTiyin: 40_000 }));

    expect(container.textContent).toContain('sarf tushumdan ko‘p');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[class*="destructive"]')).toBeNull();
  });

  it('explains that referral spending is a cost of growth', async () => {
    await render(overview({ netTiyin: -30_000 }));
    expect(container.textContent).toContain("yo'qotilgan pul emas");
  });

  it('itemises what moved the platform’s own money', async () => {
    await render(overview());
    const text = container.textContent ?? '';

    expect(text).toContain('Savdo komissiyasi');
    expect(text).toContain('Referal mukofoti');
  });

  it('reports the shortfall when the cards hold less than users are owed', async () => {
    await render(overview({ platformOwnTiyin: -50_000, ledgerCardsTiyin: 850_000 }));
    expect(container.textContent).toContain("o'z hisobidan qoplaydi");
  });

  it('leaves the referral ratio unanswered before anything is earned', async () => {
    await render(overview({ revenueInTiyin: 0, referralRewardTiyin: 0 }));
    expect(container.textContent).toContain('—');
  });

  it('says there is nothing yet rather than drawing an empty chart', async () => {
    await render(overview({
      revenueByKind: [],
      revenueInTiyin: 0,
      revenueOutTiyin: 0,
      netTiyin: 0,
    }));

    expect(container.textContent).toContain('Hali birorta ham komissiya');
  });
});
