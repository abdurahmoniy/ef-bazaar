import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { TradeProgressTimeline } from './trade-progress-timeline';
import type { TradeResponse } from '@/lib/trade-types';

it('renders all markers with status text and exposes the current step accessibly', () => {
  const html = renderToStaticMarkup(createElement(TradeProgressTimeline, {
    outcome: 'ACCEPTED', createdAt: '2026-09-22T10:00:00Z',
    trade: { state: 'WAITING_EMAIL_CHANGE', mode: 'SMART' } as TradeResponse,
  }));
  expect(html.match(/data-step=/g)).toHaveLength(9);
  expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  expect(html).toContain('bg-emerald-600');
  expect(html).toContain('bg-yellow-100');
  expect(html).toContain('Bajarildi');
  expect(html).toContain('Jarayonda');
  expect(html).toContain('Keyingi bosqich');
  expect(html).toContain('15:00');
});

it('renders a rejected step red while keeping the unsuccessful finish gray', () => {
  const html = renderToStaticMarkup(createElement(TradeProgressTimeline, {
    outcome: 'ACCEPTED', createdAt: '', trade: { state: 'REJECTED', mode: 'SMART' } as TradeResponse,
  }));
  expect(html).toContain('bg-red-600');
  expect(html).toContain('data-step="SUCCESS" data-status="next"');
  expect(html).not.toContain('aria-current');
});
