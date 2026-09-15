// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatView } from './chat-view';
import type { ChatResponse, ListingResponse } from '@/lib/marketplace-types';
import type { AccountRequest } from '@/lib/account-request';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const listing: ListingResponse = {
  id: 'listing', sellerId: 'seller', description: 'Romario yangi akkount', price: 25000,
  priceNegotiable: false, status: 'ACTIVE', attributes: { platform: 'MOBILE' },
  mediaMessageIds: [], forwardCount: 0, likeCount: 0, createdAt: '', updatedAt: '',
};
const chat: ChatResponse = {
  id: 'chat', listingId: listing.id, buyerId: 'buyer', sellerId: 'seller',
  important: false, messageCount: 0, createdAt: '',
};
let container: HTMLDivElement;
let root: Root;
let request: AccountRequest | null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  request = {
    id: 'request', chatId: chat.id, listingId: listing.id, requesterId: 'buyer',
    status: 'OPEN', createdAt: '', listing: { ...listing, price: Number(listing.price), coverMessageId: null },
  };
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const path = String(input);
    if (path.endsWith('/account-request')) return Response.json(request);
    if (path.endsWith('/partner-listings')) return Response.json([{ ...listing, coverMessageId: null }]);
    if (path.startsWith('/api/trade/v1/trades?')) return Response.json([]);
    return new Response(null, { status: 204 });
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(viewerId = 'buyer', pending = false) {
  await act(async () => root.render(createElement(ChatView, {
    chat, listing, viewerId, initialMessages: [],
    initialPendingProposal: pending ? {
      proposalId: 'proposal', marketplaceChatId: chat.id, listingId: listing.id,
      sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller', amountUzs: 25000,
      expiresAt: '',
    } : null,
  })));
}
const findButton = (label: string, parent: ParentNode = document) => Array.from(parent.querySelectorAll('button'))
  .find((button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label)!;
const click = async (button: HTMLButtonElement) => act(async () => { button.focus(); button.click(); });
const dialogs = () => document.querySelectorAll('[role="dialog"]');

describe('first-contact chat', () => {
  it('shows one compact account summary and an uncluttered conversation', async () => {
    await render();
    const messages = container.querySelector('[aria-label="Xabarlar"]')!;
    expect(messages.textContent).toContain('Suhbatni boshlang');
    expect(messages.textContent).not.toContain(listing.description);
    expect(container.textContent?.split(listing.description)).toHaveLength(2);
    expect(container.textContent).not.toContain('Chat qoidalari');
    expect(container.textContent).not.toContain('24 soat');
    expect(container.textContent).not.toContain('Kafolat');
    expect(container.querySelector('textarea[aria-label="Xabar"]')).not.toBeNull();
    expect(dialogs()).toHaveLength(0);

    await click(findButton('So‘ralgan akkount tafsilotlari'));
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].textContent).toContain('Savdo tafsilotlari');
    expect(dialogs()[0].querySelector('a[href="/marketplace/listing"]')).not.toBeNull();
    await click(findButton('Boshqa akkount tanlash', dialogs()[0]));
    expect(dialogs()).toHaveLength(2);
    expect(dialogs()[1].textContent).toContain(listing.description);
    await act(async () => dialogs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(dialogs()).toHaveLength(1);
  });

  it('keeps safety guidance available from the chat menu', async () => {
    await render();
    await click(findButton('Chat amallari'));
    expect(dialogs()[0].querySelector('a[href="/help#safety"]')?.textContent).toContain('Xavfsiz savdo qoidalari');
  });

  it('opens a single proposal form directly from the seller summary', async () => {
    await render('seller');
    await click(findButton('Taklif yuborish'));
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].querySelector('#trade-price')).not.toBeNull();
    await click(findButton('Yopish', dialogs()[0]));
    expect(dialogs()).toHaveLength(0);

    await click(findButton('So‘ralgan akkount tafsilotlari'));
    await click(findButton('Taklif yuborish', dialogs()[0]));
    expect(dialogs()).toHaveLength(2);
    expect(document.querySelectorAll('#trade-price')).toHaveLength(1);
  });

  it('opens acceptance from the pinned offer with the details sheet closed', async () => {
    await render('buyer', true);
    await click(findButton('Qabul qilish'));
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].textContent).toContain('Tasdiqlash');
    await click(findButton('Yopish', dialogs()[0]));
    expect(dialogs()).toHaveLength(0);
  });

  it('allows choosing an account when the conversation has no current request', async () => {
    request = null;
    await render();
    await click(findButton('So‘ralgan akkount tafsilotlari'));
    await click(findButton('Akkount so’rash', dialogs()[0]));
    expect(dialogs()).toHaveLength(2);
    expect(dialogs()[1].textContent).toContain(listing.description);
  });
});
