// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ChatResponse } from '@/lib/marketplace-types';

const activity = vi.hoisted(() => ({ current: null as { online: boolean } | null }));
vi.mock('@/hooks/use-chat-activity', () => ({
  useChatActivity: () => ({ activity: activity.current }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/chats' }));
vi.mock('@/components/navigation/link-pending-indicator', () => ({ LinkPendingIndicator: () => null }));

import { ChatListItem } from './chat-list-item';

const chat: ChatResponse = {
  id: 'chat', buyerId: 'buyer', sellerId: 'seller', listingId: 'listing',
  buyerDisplayName: 'Buyer', sellerDisplayName: 'Seller', important: false,
  createdAt: '2026-09-24T10:00:00Z', messageCount: 1,
};
let root: Root;
let container: HTMLDivElement;
let photoAvailable: boolean;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  activity.current = null;
  photoAvailable = true;
  vi.stubGlobal('Image', class extends EventTarget {
    complete = true;
    naturalWidth = photoAvailable ? 100 : 0;
    src = '';
  });
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
const render = (viewerId = 'buyer') => act(async () => {
  root.render(createElement(ChatListItem, { chat, viewerId }));
});

it('loads the partner photo for either participant role', async () => {
  await render();
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/auth/v1/users/seller/photo');
  await render('seller');
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/auth/v1/users/buyer/photo');
});

it('keeps initials when the partner has no photo or the photo fails', async () => {
  photoAvailable = false;
  await render();
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('[data-slot="chat-avatar"]')?.textContent).toBe('S');
});

it('shows online presence and clears it when offline or connection state is unknown', async () => {
  activity.current = { online: true };
  await render();
  expect(container.querySelector('[aria-label="Onlayn"]')).not.toBeNull();
  activity.current = { online: false };
  await render();
  expect(container.querySelector('[aria-label="Onlayn"]')).toBeNull();
  activity.current = null;
  await render();
  expect(container.querySelector('[aria-label="Onlayn"]')).toBeNull();
});
