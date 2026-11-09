// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminGrowth } from './admin-growth';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => createElement('a', { href }, children) }));

let root: Root;
let container: HTMLDivElement;

function respond(channelConfigured: boolean) {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(Response.json(String(url).includes('signups')
    ? { days: 30, total: 226, inPeriod: 30, daily: [{ date: '2026-11-08', count: 2 }, { date: '2026-11-09', count: 0 }] }
    : { configured: channelConfigured, days: 30, joins: 5, leaves: 8, daily: [] }))));
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('AdminGrowth', () => {
  it('shows totals, the channel net change and an accessible table of days', async () => {
    respond(true);
    await act(async () => root.render(createElement(AdminGrowth)));

    expect(container.textContent).toContain('226');
    expect(container.textContent).toContain('sof: −3');
    expect(container.querySelectorAll('table tbody tr')).toHaveLength(2);
    expect(container.querySelector('a[href="/admin/campaigns"]')).not.toBeNull();
  });

  it('says the channel is not configured instead of showing misleading zeros', async () => {
    respond(false);
    await act(async () => root.render(createElement(AdminGrowth)));

    expect(container.textContent).toContain('OFFICIAL_CHANNEL');
    expect(container.textContent).not.toContain('Kanaldan chiqdi');
  });
});
