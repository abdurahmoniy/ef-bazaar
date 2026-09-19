// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatView } from './chat-view';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chatKeys } from '@/lib/chat-cache';
import type { ChatResponse, ListingResponse, MessageResponse } from '@/lib/marketplace-types';
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
let queryClient: QueryClient;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  queryClient.clear();
  vi.unstubAllGlobals();
});

async function render(viewerId = 'buyer', pending = false, messages: MessageResponse[] = [], lastReadAt?: string, fetchedAt = Date.now(), initialMessagesComplete = true) {
  await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(ChatView, {
    chat: { ...chat, lastReadAt }, listing, viewerId, initialMessages: messages, initialFetchedAt: fetchedAt, initialMessagesComplete,
    initialPendingProposal: pending ? {
      proposalId: 'proposal', marketplaceChatId: chat.id, listingId: listing.id,
      sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller', amountUzs: 25000,
      expiresAt: '',
    } : null,
  }))));
}
const findButton = (label: string, parent: ParentNode = document) => Array.from(parent.querySelectorAll('button'))
  .find((button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label)!;
const click = async (button: HTMLButtonElement) => act(async () => { button.focus(); button.click(); });
const dialogs = () => document.querySelectorAll('[role="dialog"]');

const message = (id: string, overrides: Partial<MessageResponse> = {}): MessageResponse => ({
  id, chatId: chat.id, senderId: 'seller', content: 'Salom',
  createdAt: '2026-09-19T10:00:00Z', ...overrides,
});

describe('conversation messages', () => {
  it('keeps each timestamp and edited status inside its grouped bubble', async () => {
    await render('buyer', false, [message('one'), message('two', {
      createdAt: '2026-09-19T10:01:00Z', editedAt: '2026-09-19T10:02:00Z',
    })]);
    const bubbles = container.querySelectorAll('[aria-label="Xabarlar"] [role="button"]');
    expect(bubbles[0].querySelector('time')?.textContent).toContain('15:00');
    expect(bubbles[1].querySelector('time')?.textContent).toContain('15:01');
    expect(bubbles[1].textContent).toContain('tahrirlangan');
    expect(bubbles[0].getAttribute('data-group-end')).toBe('false');
    expect(bubbles[1].getAttribute('data-group-start')).toBe('false');
  });

  it('starts a new visible group at the unread divider', async () => {
    await render('buyer', false, [message('one'), message('two', {
      createdAt: '2026-09-19T10:01:00Z',
    })], '2026-09-19T10:00:30Z');
    const bubbles = container.querySelectorAll('[aria-label="Xabarlar"] [role="button"]');
    expect(bubbles[0].getAttribute('data-group-end')).toBe('true');
    expect(bubbles[1].getAttribute('data-group-start')).toBe('true');
    expect(container.querySelector('[aria-label="Xabarlar"]')?.textContent).toContain('Yangi xabarlar');
  });

  it('preserves replying and editing from the message action sheet', async () => {
    await render('buyer', false, [message('one', { senderId: 'buyer', content: 'Akkount bormi?' })]);
    const bubble = container.querySelector('[aria-label="Xabarlar"] [role="button"]') as HTMLElement;
    await act(async () => bubble.click());
    await click(findButton('Javob berish'));
    expect(container.textContent).toContain('Sizga javob');
    await click(findButton('Bekor qilish'));
    await act(async () => bubble.click());
    await click(findButton('Tahrirlash'));
    expect(container.querySelector('textarea')?.value).toBe('Akkount bormi?');
    expect(findButton('Tahrirni saqlash')).toBeDefined();
  });

  it('opens a photo without also opening its message actions', async () => {
    await render('buyer', false, [message('photo', {
      content: '', attachmentType: 'IMAGE', attachmentFileId: 'photo-id',
    })]);
    await click(findButton('Rasmni kattalashtirish'));
    expect(document.querySelector('[aria-label="Xabar amallari"]')).toBeNull();
    expect(document.querySelector('[role="dialog"][aria-label="Rasm"]')).not.toBeNull();
  });

  it('keeps keyboard activation of media controls separate from message actions', async () => {
    await render('buyer', false, [message('photo', {
      content: '', attachmentType: 'IMAGE', attachmentFileId: 'photo-id',
    })]);
    const photo = findButton('Rasmni kattalashtirish');
    await act(async () => photo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(document.querySelector('[aria-label="Xabar amallari"]')).toBeNull();
  });

  it('supports Space to open the focused message actions', async () => {
    await render('buyer', false, [message('one')]);
    const bubble = container.querySelector('[aria-label="Xabarlar"] [role="button"]') as HTMLElement;
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    await act(async () => bubble.dispatchEvent(space));
    expect(space.defaultPrevented).toBe(true);
    expect(document.querySelector('[aria-label="Xabar amallari"]')).not.toBeNull();
  });
});

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


describe('conversation cache revisits', () => {
  it('shows newer cached messages immediately when an old route is revisited', async () => {
    const serverFetchedAt = Date.now() - 1_000;
    await render('buyer', false, [message('one', { content: 'Old server text' })], undefined, serverFetchedAt);
    await act(async () => {
      queryClient.setQueryData(chatKeys.messages('buyer', chat.id), [message('one', { content: 'Confirmed edit' })]);
      root.render(createElement(QueryClientProvider, { client: queryClient }, null));
    });
    await render('buyer', false, [message('one', { content: 'Old server text' })], undefined, serverFetchedAt);
    expect(container.textContent).toContain('Confirmed edit');
    expect(container.textContent).not.toContain('Old server text');
    const messageFetches = vi.mocked(fetch).mock.calls.filter(([path]) => String(path).includes('/messages?'));
    expect(messageFetches).toHaveLength(0);
  });

  it('accepts a genuinely newer server snapshot after an explicit refresh', async () => {
    const serverFetchedAt = Date.now() - 1_000;
    await render('buyer', false, [message('one', { content: 'Original' })], undefined, serverFetchedAt);
    await render('buyer', false, [message('one', { content: 'Fresh server snapshot' })], undefined, Date.now());
    expect(queryClient.getQueryData<MessageResponse[]>(chatKeys.messages('buyer', chat.id))?.[0].content)
      .toBe('Fresh server snapshot');
  });

  it('does not render another account’s cached conversation', async () => {
    queryClient.setQueryData(chatKeys.messages('seller', chat.id), [message('secret', { content: 'Other account cached text' })]);
    await render('buyer', false, [message('mine', { content: 'My current messages' })]);
    expect(container.textContent).toContain('My current messages');
    expect(container.textContent).not.toContain('Other account cached text');
  });
});


describe('partial server message snapshots', () => {
  const history = () => Array.from({ length: 200 }, (_, index) => message(`history-${index}`, {
    content: `Message ${index}`, createdAt: new Date(Date.UTC(2026, 8, 19, 10, index)).toISOString(),
  }));

  it('retains 200 cached messages when a newer server snapshot contains only the first 100', async () => {
    const messages = history();
    queryClient.setQueryData(chatKeys.messages('buyer', chat.id), messages, { updatedAt: Date.now() - 1_000 });
    const partial = messages.slice(0, 100).map((item, index) => index === 0 ? { ...item, content: 'Updated first message' } : item);
    await render('buyer', false, partial, undefined, Date.now(), false);
    const cached = queryClient.getQueryData<MessageResponse[]>(chatKeys.messages('buyer', chat.id))!;
    expect(cached).toHaveLength(200);
    expect(cached[0].content).toBe('Updated first message');
    expect(cached.at(-1)?.id).toBe('history-199');
  });

  it('replaces cached history when the server confirms a complete snapshot', async () => {
    const messages = history();
    queryClient.setQueryData(chatKeys.messages('buyer', chat.id), messages, { updatedAt: Date.now() - 1_000 });
    await render('buyer', false, messages.slice(0, 100), undefined, Date.now(), true);
    expect(queryClient.getQueryData<MessageResponse[]>(chatKeys.messages('buyer', chat.id))).toHaveLength(100);
  });

  it('fetches the larger client page immediately when only a partial server page seeds the cache', async () => {
    const messages = history();
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => String(input).includes('/messages?')
      ? Response.json({ content: messages, totalPages: 1 })
      : originalFetch(input, init));
    await render('buyer', false, messages.slice(0, 100), undefined, Date.now(), false);
    const messageFetches = vi.mocked(fetch).mock.calls.filter(([path]) => String(path).includes('/messages?'));
    expect(messageFetches).toHaveLength(1);
    expect(queryClient.getQueryData<MessageResponse[]>(chatKeys.messages('buyer', chat.id))).toHaveLength(200);
  });
});
