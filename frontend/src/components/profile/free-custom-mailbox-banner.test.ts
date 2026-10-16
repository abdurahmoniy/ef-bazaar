// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { FreeCustomMailboxBanner } from './free-custom-mailbox-banner';
import type { CustomMailbox } from '@/lib/custom-mailbox';

const box = (id: string, over: Partial<CustomMailbox> = {}): CustomMailbox => ({
  id, email: `${id}@efbazaar.uz`, provisioned: true, locked: false, linkedAccountId: null,
  activeSessionId: null, createdAt: '', ...over,
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

it('asks to relink each empty box and leaves busy ones alone', async () => {
  await act(async () => root.render(createElement(FreeCustomMailboxBanner, {
    boxes: [box('nodirpro'), box('alibek1', { linkedAccountId: 'a1' })],
  })));

  expect(container.textContent).toContain('nodirpro@efbazaar.uz bo‘sh turibdi — boshqa akkountingizga ulaysizmi?');
  expect(container.textContent).not.toContain('alibek1@efbazaar.uz');
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/mailboxes/custom/nodirpro/link');
});

it('renders nothing when every box is in use', async () => {
  await act(async () => root.render(createElement(FreeCustomMailboxBanner, { boxes: [box('a', { linkedAccountId: 'x' })] })));
  expect(container.innerHTML).toBe('');
});
