// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InvoicePanel } from './invoice-panel';
import type { InvoiceResponse } from '@/lib/payment-types';

/** Explicit escape — never assert a literal invisible character. See money.test.ts. */
const NBSP = '\u00A0';

const PAN = '9860123456789012';
// The clock is pinned: with a live `Date.now()` the fixture and the component
// read it a millisecond apart and the countdown flips between 15:00 and 14:59.
const NOW = '2026-08-13T09:00:00Z';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

function invoice(overrides: Partial<InvoiceResponse> = {}): InvoiceResponse {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    pan: PAN,
    holderName: 'EFBAZAAR MCHJ',
    cardExpiry: '12/29',
    requestedTiyin: 10_000_000,
    transferTiyin: 10_000_000,
    expiresAt: '2026-08-13T09:15:00Z',
    status: 'PENDING',
    ...overrides,
  };
}

function render(overrides: Partial<InvoiceResponse> = {}) {
  return renderToStaticMarkup(
    createElement(InvoicePanel, { invoice: invoice(overrides), onExpired: () => {} }),
  );
}

describe('InvoicePanel', () => {
  it('shows the full card number, grouped — this is the one place it may appear', () => {
    expect(render()).toContain('9860 1234 5678 9012');
  });

  it('names the card holder and expiry', () => {
    const markup = render();
    expect(markup).toContain('EFBAZAAR MCHJ');
    expect(markup).toContain('12/29');
  });

  it('leads with the amount that must actually be transferred', () => {
    const markup = render({ requestedTiyin: 10_000_000, transferTiyin: 10_010_000 });
    expect(markup).toContain(`100${NBSP}100`);
  });

  it('always warns that the amount must match exactly', () => {
    expect(render()).toContain('aynan');
  });

  it('explains the bump with both numbers, so it does not read as a bug', () => {
    const markup = render({ requestedTiyin: 10_000_000, transferTiyin: 10_010_000 });
    expect(markup).toContain(`100${NBSP}000`);
    expect(markup).toContain(`100${NBSP}100`);
    expect(markup).toContain('boshqa to‘lov ham kutilmoqda');
  });

  it('says nothing about a bump when the amount was not bumped', () => {
    expect(render()).not.toContain('boshqa to‘lov ham kutilmoqda');
  });

  it('starts the countdown from the remaining time, not from zero', () => {
    // 15-minute TTL — the clock must not render 00:00 on first paint.
    expect(render()).toContain('15:00');
  });

  it('shows an expired invoice as a spent clock and tells the user what to do', () => {
    const markup = render({ expiresAt: '2026-08-13T08:59:59Z' });
    expect(markup).toContain('00:00');
    expect(markup).toContain('Muddat tugadi');
  });

  it('keeps the card number readable past the deadline', () => {
    // A transfer already in flight must still be completable or checkable.
    expect(render({ expiresAt: '2026-08-13T08:59:59Z' })).toContain('9860 1234 5678 9012');
  });

  it('tells an expired user not to transfer a second time', () => {
    expect(render({ expiresAt: '2026-08-13T08:59:59Z' })).toContain('qayta o‘tkazmang');
  });

  it('offers the new-request button only on a dead invoice', () => {
    const expired = renderToStaticMarkup(
      createElement(InvoicePanel, {
        invoice: invoice({ expiresAt: '2026-08-13T08:59:59Z' }),
        onExpired: () => {},
        onDismiss: () => {},
      }),
    );
    const live = renderToStaticMarkup(
      createElement(InvoicePanel, {
        invoice: invoice(),
        onExpired: () => {},
        onDismiss: () => {},
      }),
    );
    expect(expired).toContain('Yangi so‘rov');
    expect(live).not.toContain('Yangi so‘rov');
  });

  it('carries the countdown in a live region, without reading out every second', () => {
    const markup = render();
    expect(markup).toContain('aria-live="polite"');
    // 15:00 is above the first threshold, so the region starts empty.
    expect(markup).toContain('<p aria-live="polite" class="sr-only"></p>');
  });

  it('announces the closing window once it matters', () => {
    // 09:04:30 — four and a half minutes left.
    const markup = render({ expiresAt: '2026-08-13T09:04:30Z' });
    expect(markup).toContain('besh daqiqa');
  });
});
