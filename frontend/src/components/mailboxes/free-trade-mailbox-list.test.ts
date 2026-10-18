// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { FreeTradeMailboxList } from './free-trade-mailbox-list';
import type { OwnedMailbox } from '@/lib/mailbox-slots';

const box = (id: string, over: Partial<OwnedMailbox> = {}): OwnedMailbox => ({
  id, email: `${id}@efbazaar.uz`, tradeId: null, createdAt: '', handedOffAt: null, locked: false,
  kind: 'RANDOM', linkedAccountId: null, activeSessionId: null, provisionedAt: '2026-10-01T00:00:00Z', ...over,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it('lists trade boxes nobody uses, each with a link button', async () => {
  await act(async () => root.render(createElement(FreeTradeMailboxList, {
    boxes: [box('trade-1'), box('trade-2'), box('alibek1', { kind: 'CUSTOM' })],
    accountEmails: ['trade-2@efbazaar.uz'],
  })));

  expect(container.textContent).toContain('trade-1@efbazaar.uz');
  expect(container.textContent).not.toContain('trade-2@efbazaar.uz');
  expect(container.textContent).not.toContain('alibek1@efbazaar.uz');
  const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('Akkount ulash'));
  expect(link?.getAttribute('href')).toBe('/mailboxes/custom/trade-1/link');
});

it('renders nothing without free trade boxes', async () => {
  await act(async () => root.render(createElement(FreeTradeMailboxList, { boxes: [box('x', { linkedAccountId: 'a' })], accountEmails: [] })));
  expect(container.innerHTML).toBe('');
});
