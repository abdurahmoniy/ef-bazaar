// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { FreeCustomMailboxBanner } from './free-custom-mailbox-banner';
import type { OwnedMailbox } from '@/lib/mailbox-slots';

const box = (id: string, over: Partial<OwnedMailbox> = {}): OwnedMailbox => ({
  id, email: `${id}@efbazaar.uz`, tradeId: null, createdAt: '', handedOffAt: null, locked: false,
  kind: 'CUSTOM', linkedAccountId: null, activeSessionId: null, provisionedAt: '2026-10-01T00:00:00Z', ...over,
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

const render = (boxes: OwnedMailbox[], accountEmails: string[] = []) =>
  act(async () => root.render(createElement(FreeCustomMailboxBanner, { boxes, accountEmails })));

it('asks to relink the one empty box and leaves busy ones alone', async () => {
  await render([box('nodirpro'), box('alibek1', { linkedAccountId: 'a1' })]);

  expect(container.textContent).toContain('nodirpro@efbazaar.uz bo‘sh turibdi — akkountingizga ulaysizmi?');
  expect(container.textContent).not.toContain('alibek1@efbazaar.uz');
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/mailboxes/custom/nodirpro/link');
});

it('sums up several empty boxes, trade ones included, into one row', async () => {
  await render([box('nodirpro'), box('trade-1', { kind: 'RANDOM' }), box('trade-2', { kind: 'RANDOM' })], ['trade-2@efbazaar.uz']);

  expect(container.textContent).toContain('2 ta pochta bo‘sh turibdi — akkountlaringizga ulaysizmi?');
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/mailboxes/custom');
});

it('renders nothing when every box is in use', async () => {
  await render([box('a', { linkedAccountId: 'x' })]);
  expect(container.innerHTML).toBe('');
});
