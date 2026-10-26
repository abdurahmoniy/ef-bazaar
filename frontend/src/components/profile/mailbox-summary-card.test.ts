// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/lib/mailbox-slots', async (original) => ({
  ...(await original<typeof import('@/lib/mailbox-slots')>()),
  fetchSlotStatus: vi.fn(),
}));

import { fetchSlotStatus, type MailboxSlotStatus } from '@/lib/mailbox-slots';
import { siteConfig } from '@/lib/site';
import { MailboxSummaryCard } from './mailbox-summary-card';

let root: Root;
let container: HTMLDivElement;
const quota: MailboxSlotStatus = {
  used: 99, limit: 99, totalUsed: 2, totalLimit: 3, customUsed: 1,
  customLimit: 2, lockedCount: 0, full: false, plan: 'STANDARD',
};
const render = () => act(async () => root.render(createElement(MailboxSummaryCard)));
const text = () => container.textContent ?? '';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(fetchSlotStatus).mockReset().mockResolvedValue(quota);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('shows authoritative total allocation and a webmail link in a neutral compact card', async () => {
  await render();
  expect(text()).toContain('2 / 3');
  expect(text()).not.toContain('99');
  expect(text()).not.toContain('custom');
  expect(text()).not.toContain('qoldi');
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector('section')?.className).not.toMatch(/amber|destructive/);
  expect(container.querySelector('a')?.getAttribute('href')).toBe(siteConfig.mailUrl);
  expect(container.querySelector('a')?.textContent).toContain('Pochtani ochish');
  expect(container.querySelectorAll('button')).toHaveLength(0);
});

it('renders a real zero usage and zero limit as known values', async () => {
  vi.mocked(fetchSlotStatus).mockResolvedValue({ ...quota, totalUsed: 0, totalLimit: 0, full: true });
  await render();
  expect(text()).toContain('0 / 0');
  expect(text()).not.toContain('yuklanmadi');
  expect(text()).not.toContain('cheksiz');
});

it('labels only an explicit null limit as unlimited', async () => {
  vi.mocked(fetchSlotStatus).mockResolvedValue({ ...quota, totalUsed: 4, totalLimit: null });
  await render();
  expect(text()).toContain('4 / cheksiz');
});

it('keeps the webmail entry and hides quota for STAFF', async () => {
  vi.mocked(fetchSlotStatus).mockResolvedValue({ ...quota, plan: 'STAFF', totalUsed: 17, totalLimit: null });
  await render();
  expect(text()).not.toContain('17');
  expect(text()).not.toContain('cheksiz');
  expect(container.querySelector('a')?.getAttribute('href')).toBe(siteConfig.mailUrl);
});

it('does not show zero or unlimited while loading', async () => {
  vi.mocked(fetchSlotStatus).mockReturnValue(new Promise(() => {}));
  await render();
  expect(text()).toContain('Yuklanmoqda');
  expect(text()).not.toContain('0 /');
  expect(text()).not.toContain('cheksiz');
  expect(container.querySelector('a')?.getAttribute('href')).toBe(siteConfig.mailUrl);
});

it('shows unavailable data separately and lets the user retry', async () => {
  vi.mocked(fetchSlotStatus).mockResolvedValueOnce(null);
  await render();
  expect(text()).toContain('Pochta holati yuklanmadi');
  expect(text()).not.toContain('0 /');
  expect(text()).not.toContain('cheksiz');
  const retry = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Qayta urinish'));
  expect(retry).toBeDefined();
  await act(async () => retry!.click());
  expect(text()).toContain('2 / 3');
});

it('discards a quota request when its viewer boundary unmounts', async () => {
  let finish!: (value: MailboxSlotStatus | null) => void;
  vi.mocked(fetchSlotStatus).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await act(async () => root.render(createElement(MailboxSummaryCard, { key: 'first-viewer' })));
  await act(async () => root.render(createElement(MailboxSummaryCard, { key: 'next-viewer' })));
  expect(text()).toContain('2 / 3');
  await act(async () => finish({ ...quota, totalUsed: 18, totalLimit: 20 }));
  expect(text()).toContain('2 / 3');
  expect(text()).not.toContain('18 / 20');
});
