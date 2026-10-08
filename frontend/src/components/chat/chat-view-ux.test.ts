import { emitChatEvent, socketFixture } from '@/test/chat-socket-fixture';
// @vitest-environment jsdom

import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatView } from './chat-view';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chatKeys } from '@/lib/chat-cache';
import type { ChatResponse, ListingResponse, MessageResponse } from '@/lib/marketplace-types';
import type { AccountRequest } from '@/lib/account-request';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/use-emoji-packs', () => ({ useEmojiPacks: () => ({
  packs: [{ id: 'pack', title: 'Football', setName: 'Football', items: [{ customEmojiId: '123', emoji: '😊', format: 'static', thumbnailUrl: '/bot/emoji/thumb', fileUrl: '/bot/emoji/file' }] }],
  thumbnailUrls: new Map([['123', '/bot/emoji/thumb']]),
  fileUrls: new Map([['123', '/bot/emoji/file']]),
}) }));

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
let pendingProposal: unknown = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  pendingProposal = null;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  request = {
    id: 'request', chatId: chat.id, listingId: listing.id, requesterId: 'buyer',
    status: 'OPEN', createdAt: '', listing: { ...listing, price: Number(listing.price), coverMessageId: null },
  };
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const path = String(input);
    if (path === '/api/marketplace/v1/chats/chat') return Response.json(chat);
    if (path.includes('/proposals?')) return pendingProposal ? Response.json(pendingProposal) : new Response(null, { status: 404 });
    if (path.endsWith('/wallet')) return Response.json({ availableTiyin: 2500000 });
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
  pendingProposal = pending ? { proposalId: 'proposal', marketplaceChatId: chat.id, listingId: listing.id, sellerId: 'seller', buyerId: 'buyer', proposerUserId: 'seller', amountUzs: 25000, expiresAt: '' } : null;
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
  it('prioritizes network availability and follows offline, online and socket events in the header', async () => {
    const network = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      await render('buyer', false, [message('existing')]);
      const header = container.querySelector('header')!;
      expect(header.textContent).toContain('Tarmoq kutilmoqda…');
      await act(async () => emitChatEvent({ type: 'disconnected' }));
      expect(header.textContent).toContain('Tarmoq kutilmoqda…');
      network.mockReturnValue(true);
      await act(async () => window.dispatchEvent(new Event('online')));
      expect(header.textContent).toContain('Ulanmoqda…');
      await act(async () => emitChatEvent({ type: 'connected' }));
      expect(header.textContent).toContain('Savdo suhbati');
      network.mockReturnValue(false);
      await act(async () => window.dispatchEvent(new Event('offline')));
      expect(header.textContent).toContain('Tarmoq kutilmoqda…');
      expect(container.querySelector('[data-message-id="existing"]')).not.toBeNull();
    } finally {
      network.mockRestore();
      onlineManager.setOnline(true);
    }
  });

  it.each([200, 503])('shows updating only while messages are fetching, including completion with HTTP %s', async status => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    let finish!: (response: Response) => void;
    const response = new Promise<Response>(resolve => { finish = resolve; });
    vi.mocked(fetch).mockImplementation(async (...args) => {
      if (String(args[0]).includes('/messages?')) return response;
      if (String(args[0]).endsWith('/activity')) return Response.json({ online: true, typing: true, lastSeenAt: null, lastReadAt: null });
      return originalFetch(...args);
    });
    await render('buyer', false, [message('existing')], undefined, 0);
    const header = container.querySelector('header')!;
    expect(header.querySelector('[role="status"]')?.textContent ?? '').toContain('Yangilanmoqda…');
    expect(header.textContent).not.toContain('yozmoqda');
    expect(container.querySelector('[data-message-id="existing"]')).not.toBeNull();
    await act(async () => emitChatEvent({ type: 'disconnected' }));
    expect(header.textContent).toContain('Ulanmoqda…');
    await act(async () => emitChatEvent({ type: 'connected' }));
    expect(header.textContent).toContain('Yangilanmoqda…');
    await act(async () => {
      finish(Response.json(status === 200 ? [message('existing')] : { message: 'Unavailable' }, { status }));
    });
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(header.textContent).toContain('yozmoqda');
      expect(header.textContent).not.toContain('Yangilanmoqda');
    });
    if (status === 503) expect(container.textContent).toContain('Xabarlarni yangilab bo‘lmadi');
  });

  it('shows connection progress in the header and restores activity after reconnecting', async () => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (...args) => String(args[0]).endsWith('/activity')
      ? Response.json({ online: true, typing: false, lastSeenAt: null, lastReadAt: null })
      : originalFetch(...args));
    socketFixture.connected = false;
    try {
      await render('buyer', false, [message('existing')]);
      const header = container.querySelector('header')!;
      expect(header.querySelector('[role="status"]')?.textContent ?? '').toContain('Ulanmoqda');
      expect(header.textContent).not.toContain('Onlayn');
      expect(container.textContent).not.toContain('Chatga ulanmoqda');
      expect(container.querySelector('[data-message-id="existing"]')).not.toBeNull();
      await act(async () => emitChatEvent({ type: 'connected' }));
      expect(header.textContent).toContain('Onlayn');
      expect(header.textContent).not.toContain('Ulanmoqda');
      await act(async () => emitChatEvent({ type: 'disconnected' }));
      expect(header.querySelector('[role="status"]')?.textContent ?? '').toContain('Ulanmoqda');
    } finally {
      socketFixture.connected = true;
    }
  });

  it('keeps one accessible timestamp with the text or caption, and overlays it only on captionless photos', async () => {
    await render('buyer', false, [
      message('short', { senderId: 'buyer', content: 'Salom 👋' }),
      message('long', { senderId: 'buyer', content: 'Akkount haqida batafsil ma’lumot bera olasizmi? Kartalarini ham ko‘rmoqchiman. Rahmat!', editedAt: '2026-09-19T10:01:00Z' }),
      message('lines', { content: 'Birinchi qator\nIkkinchi qator' }),
      message('caption', { content: 'Mana akkount rasmi', attachmentType: 'IMAGE', attachmentFileId: 'photo-id' }),
      message('photo', { senderId: 'buyer', content: '', attachmentType: 'IMAGE', attachmentFileId: 'photo-id' }),
    ]);
    for (const id of ['short', 'long', 'lines', 'caption']) {
      const bubble = container.querySelector(`[data-message-id="${id}"] .chat-message-bubble`)!;
      expect(bubble.querySelectorAll('time')).toHaveLength(1);
      expect(bubble.querySelector('.chat-message-text time')).not.toBeNull();
      expect(bubble.querySelector('.chat-message-meta-space')?.getAttribute('aria-hidden')).toBe('true');
    }
    const style = document.createElement('style');
    style.textContent = readFileSync('src/components/chat/chat-conversation.css', 'utf8');
    document.head.appendChild(style);
    try {
      for (const id of ['short', 'long', 'lines', 'caption']) {
        const meta = container.querySelector(`[data-message-id="${id}"] .chat-message-text > .chat-message-meta`)!;
        expect(window.getComputedStyle(meta).position).toBe('absolute');
        expect(window.getComputedStyle(meta).bottom).toBe(meta.parentElement!.getAttribute('data-caption') === 'true' ? '4px' : '0px');
      }
    } finally {
      style.remove();
    }
    const photo = container.querySelector('[data-message-id="photo"] .chat-message-bubble')!;
    expect(photo.querySelector('[data-overlay="true"] time')).not.toBeNull();
    expect(photo.querySelector('.chat-message-meta-space')).toBeNull();
    expect(container.querySelectorAll('[aria-label="Yuborilgan"]')).toHaveLength(3);
  });

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
    expect(messageEditor().textContent).toBe('Akkount bormi?');
    expect(findButton('Tahrirni saqlash')).toBeDefined();
  });

  it('swipes right to reply without opening actions and ignores vertical scrolling', async () => {
    await render('buyer', false, [message('touch')]);
    const bubble = container.querySelector<HTMLElement>('[data-message-id="touch"] .chat-message-bubble')!;
    await touch(bubble, 'touchstart', [[50, 100]]);
    await touch(bubble, 'touchmove', [[130, 104]]);
    expect(bubble.style.transform).toContain('translateX');
    await touch(bubble, 'touchend', [[130, 104]]);
    await act(async () => bubble.click());
    expect(container.textContent).toContain('ga javob');
    expect(document.querySelector('[aria-label="Xabar amallari"]')).toBeNull();
    await click(findButton('Bekor qilish'));
    await touch(bubble, 'touchstart', [[50, 100]]);
    await touch(bubble, 'touchmove', [[55, 180]]);
    await touch(bubble, 'touchend', [[55, 180]]);
    expect(container.textContent).not.toContain('ga javob');
  });

  it('long presses a photo for permitted actions without opening the image', async () => {
    await render('buyer', false, [message('touch', { attachmentType: 'IMAGE', attachmentFileId: 'photo' })]);
    vi.useFakeTimers();
    try {
      const photo = findButton('Rasmni kattalashtirish');
      await touch(photo, 'touchstart', [[50, 100]]);
      await act(async () => vi.advanceTimersByTime(550));
      expect(document.querySelector('[aria-label="Xabar amallari"]')).not.toBeNull();
      expect(findButton('Tahrirlash')).toBeUndefined();
      expect(findButton("O'chirish")).toBeUndefined();
      expect(findButton('Tanlash')).toBeDefined();
      await touch(photo, 'touchend', [[50, 100]]);
      await act(async () => photo.click());
      expect(document.querySelector('[data-testid="zoomable-lightbox"]')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('opens the chat image sequence, swipes between images and down to close', async () => {
    await render('buyer', false, [message('one', { attachmentType: 'IMAGE', attachmentFileId: 'first' }), message('two', { attachmentType: 'IMAGE', attachmentFileId: 'second' })]);
    await click(findButton('Rasmni kattalashtirish'));
    const viewer = document.querySelector('[data-testid="zoomable-lightbox"]')!;
    expect(viewer.textContent).toContain('1 / 2');
    const area = viewer.querySelector('img')!.parentElement!;
    await touch(area, 'touchstart', [[200, 100]]);
    await touch(area, 'touchend', [[60, 104]]);
    expect(viewer.textContent).toContain('2 / 2');
    expect(viewer.querySelector('img')?.src).toContain('second');
    await touch(area, 'touchstart', [[100, 100]]);
    await touch(area, 'touchend', [[103, 230]]);
    expect(document.querySelector('[data-testid="zoomable-lightbox"]')).toBeNull();
  });

  it('selects a message and keeps copy/delete permissions when choosing another message', async () => {
    await render('buyer', false, [message('theirs'), message('mine', { senderId: 'buyer' })]);
    const theirs = container.querySelector<HTMLElement>('[data-message-id="theirs"] .chat-message-bubble')!;
    await act(async () => theirs.click());
    await click(findButton('Tanlash'));
    expect(theirs.getAttribute('aria-pressed')).toBe('true');
    const toolbar = container.querySelector('[aria-label="Tanlangan xabar"]')!;
    expect(findButton('Nusxa olish', toolbar)).toBeDefined();
    expect(findButton("O'chirish", toolbar)).toBeUndefined();
    const mine = container.querySelector<HTMLElement>('[data-message-id="mine"] .chat-message-bubble')!;
    await touch(mine, 'touchstart', [[50, 100]]);
    await touch(mine, 'touchend', [[50, 100]]);
    expect(mine.getAttribute('aria-pressed')).toBe('true');
    expect(findButton("O'chirish", toolbar)).toBeDefined();
    expect(document.querySelector('[aria-label="Xabar amallari"]')).toBeNull();
    await click(findButton('Tanlashni bekor qilish'));
    expect(container.querySelector('[aria-label="Tanlangan xabar"]')).toBeNull();
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
    expect(container.querySelector('[contenteditable="true"][aria-label="Xabar"]')).not.toBeNull();
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

  it('uses one inline message editor and replaces the mobile keyboard with an emoji dock', async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    try {
      await render();
      const editor = container.querySelector<HTMLElement>('[contenteditable="true"][aria-label="Xabar"]');
      expect(editor).not.toBeNull();
      expect(container.querySelector('textarea')).toBeNull();
      await act(async () => editor!.focus());
      await click(findButton('Emoji tanlash'));
      expect(document.activeElement).not.toBe(editor);
      const panel = container.querySelector('[aria-label="Emoji tanlash paneli"]')!;
      expect(panel).not.toBeNull();
      expect(panel.querySelector('input')).toBeNull();
      expect(editor!.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(findButton('Belgini o‘chirish')).toBeDefined();
      await click(findButton('Klaviaturani ochish'));
      expect(container.querySelector('[aria-label="Emoji tanlash paneli"]')).toBeNull();
      expect(document.activeElement).toBe(editor);
      await click(findButton('Emoji tanlash'));
      await act(async () => editor!.focus());
      expect(container.querySelector('[aria-label="Emoji tanlash paneli"]')).toBeNull();
    } finally { Object.defineProperty(window, 'innerWidth', { configurable: true, value: width }); }
  });

  it('inserts a picked emoji at the cursor without sending the draft', async () => {
    await render();
    const input = messageEditor();
    await act(async () => {
      input.textContent = 'Salom dunyo';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.focus();
      const range = document.createRange(); range.setStart(input.firstChild!, 6); range.collapse(true);
      window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(findButton('Emoji tanlash')).toBeDefined();
    await click(findButton('Emoji tanlash'));
    const custom = container.querySelector<HTMLButtonElement>('button[data-emoji-id="123"]');
    expect(custom).not.toBeNull();
    await click(custom!);
    const editor = container.querySelector('[contenteditable="true"][aria-label="Xabar"]')!;
    expect(editor.textContent).toBe('Salom dunyo');
    expect(editor.querySelector('img[data-emoji-id="123"]')).not.toBeNull();
    expect(sessionStorage.getItem('chat-draft:buyer:chat')).toBe('Salom <tg-emoji emoji-id="123">😊</tg-emoji>dunyo');
    await click(container.querySelector<HTMLButtonElement>('button[data-emoji-id="123"]')!);
    expect(editor.querySelectorAll('img[data-emoji-id="123"]')).toHaveLength(2);
    expect(sessionStorage.getItem('chat-draft:buyer:chat')).toBe('Salom <tg-emoji emoji-id="123">😊</tg-emoji><tg-emoji emoji-id="123">😊</tg-emoji>dunyo');
    expect(container.querySelector('[aria-label="Emoji tanlash paneli"]')).not.toBeNull();
    await click(findButton('Klaviaturani ochish'));
    expect(container.querySelector('[aria-label="Emoji tanlash paneli"]')).toBeNull();
    expect(editor.querySelector('img[data-emoji-id="123"]')).not.toBeNull();
  });

  it('renders stored custom emoji inline without exposing token markup', async () => {
    await render('buyer', false, [message('custom', { content: 'Hi <tg-emoji emoji-id="123">😊</tg-emoji>!' })]);
    const text = container.querySelector('[data-message-id="custom"] .chat-message-text')!;
    expect(text.querySelector('img')?.getAttribute('src')).toBe('/bot/emoji/file');
    expect(text.textContent).toContain('Hi !');
    expect(text.textContent).not.toContain('tg-emoji');
  });

  it('retains bottom safe-area padding when a mobile composer stays focused', async () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    try {
      await render();
      const input = messageEditor();
      await act(async () => input.focus());
      const composer = input.parentElement!.parentElement!.parentElement!.parentElement!;
      const css = await postcss([tailwindcss({ content: [{ raw: composer.outerHTML, extension: 'html' }], corePlugins: { preflight: false } })])
        .process('@tailwind utilities;', { from: undefined });
      const style = document.createElement('style');
      style.textContent = css.css;
      document.head.appendChild(style);
      try {
        expect(window.getComputedStyle(composer).paddingBottom).toContain('--chat-safe-bottom');
      } finally { style.remove(); }
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: previousWidth, configurable: true });
    }
  });

  it('toggles and persists dark mode from the chat menu', async () => {
    const previousClass = document.documentElement.className;
    const previousTheme = localStorage.getItem('efbazaar-theme');
    const previousResolved = document.documentElement.dataset.resolvedTheme;
    document.documentElement.classList.remove('dark');
    try {
      await render();
      await click(findButton('Chat amallari'));
      expect(findButton('Qorong‘i rejim', dialogs()[0])).toBeDefined();
      await click(findButton('Qorong‘i rejim', dialogs()[0]));
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem('efbazaar-theme')).toBe('dark');
      await click(findButton('Yorug‘ rejim', dialogs()[0]));
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(localStorage.getItem('efbazaar-theme')).toBe('light');
    } finally {
      document.documentElement.className = previousClass;
      if (previousTheme === null) localStorage.removeItem('efbazaar-theme');
      else localStorage.setItem('efbazaar-theme', previousTheme);
      if (previousResolved === undefined) delete document.documentElement.dataset.resolvedTheme;
      else document.documentElement.dataset.resolvedTheme = previousResolved;
    }
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
    expect(dialogs()[0].textContent).toContain('to‘lash va boshlash');
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

function messageEditor() {
  return container.querySelector<HTMLElement>('[role="textbox"][aria-label="Xabar"]')!;
}

async function typeDraft(value: string) {
  const input = messageEditor();
  await act(async () => {
    input.textContent = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('draft recovery', () => {
  it('keeps an unsent draft when editing another message is cancelled', async () => {
    await render('buyer', false, [message('mine', { senderId: 'buyer', content: 'Original message' })]);
    await typeDraft('My unsent draft');
    await act(async () => (container.querySelector('[aria-label="Xabarlar"] [role="button"]') as HTMLElement).click());
    await click(findButton('Tahrirlash'));
    expect(messageEditor().textContent).toBe('Original message');
    await click(findButton('Bekor qilish'));
    expect(messageEditor().textContent).toBe('My unsent draft');
  });
  it('retains a failed message in the outbox after navigation', async () => {
    await render(); await typeDraft('Do not lose this');
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => init?.method === 'POST' && String(input).endsWith('/messages')
      ? new Response(null, { status: 503 }) : originalFetch(input, init));
    await click(findButton('Xabarni yuborish'));
    expect(messageEditor().textContent).toBe('');
    await vi.waitFor(() => expect(container.querySelector('[data-outbox-id]')?.textContent).toContain('Do not lose this'));
    await act(async () => root.render(null)); await render();
    expect(messageEditor().textContent).toBe('');
    await vi.waitFor(() => expect(container.querySelector('[data-outbox-id]')?.textContent).toContain('Do not lose this'));
  });
});

it('shows failed trade synchronization with a working retry without hiding the conversation', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  let failing = true;
  vi.mocked(fetch).mockImplementation(async (input, init) => failing && String(input).startsWith('/api/trade/v1/trades?')
    ? new Response(null, { status: 503 }) : originalFetch(input, init));
  await render('buyer', false, [message('one')]);
  expect(container.textContent).toContain('Savdo ma’lumotlarini yangilab bo‘lmadi');
  expect(container.querySelector('[aria-label="Xabarlar"]')?.textContent).toContain('Salom');
  failing = false; await click(findButton('Savdoni qayta yuklash'));
  expect(container.textContent).not.toContain('Savdo ma’lumotlarini yangilab bo‘lmadi');
});

it('shows a message refresh failure instead of a misleading empty conversation and allows retry', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  let failing = true;
  vi.mocked(fetch).mockImplementation(async (input, init) => String(input).includes('/messages?')
    ? failing ? new Response(null, { status: 503 }) : Response.json({ content: [message('recovered')], totalPages: 1 })
    : originalFetch(input, init));
  await render('buyer', false, [], undefined, 0);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(container.textContent).toContain('Xabarlarni yangilab bo‘lmadi');
  expect(container.textContent).not.toContain('Suhbatni boshlang');
  failing = false; await click(findButton('Xabarlarni qayta yuklash'));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(container.querySelector('[aria-label="Xabarlar"]')?.textContent).toContain('Salom');
  expect(container.textContent).not.toContain('Xabarlarni yangilab bo‘lmadi');
});

it('clears a sent draft so it cannot return after navigation', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => init?.method === 'POST' && String(input).endsWith('/messages')
    ? Response.json(message('sent', { senderId: 'buyer', content: 'Sent text' })) : originalFetch(input, init));
  await render(); await typeDraft('Sent text'); await click(findButton('Xabarni yuborish'));
  expect(messageEditor().textContent).toBe('');
  await act(async () => root.render(null)); await render();
  expect(messageEditor().textContent).toBe('');
});

it.each([503, 429, 408, 'network'])('allows retrying message failure %s without interval polling', async status => {
  vi.useFakeTimers();
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  let failing = true;
  let messageRequests = 0;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (!String(input).includes('/messages?')) return originalFetch(input, init);
    messageRequests++;
    if (!failing) return Response.json({ content: [message('recovered')], totalPages: 1 });
    if (status === 'network') throw new TypeError('Network unavailable');
    return new Response(null, { status: Number(status) });
  });
  try {
    await render('buyer', false, [], undefined, 0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(messageRequests).toBe(1);
    failing = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(29_000); });
    expect(messageRequests).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000); });
    expect(messageRequests).toBe(1);
    await click(findButton('Xabarlarni qayta yuklash'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(messageRequests).toBe(2);
    expect(container.querySelector('[aria-label="Xabarlar"]')?.textContent).toContain('Salom');
  } finally { vi.useRealTimers(); }
});

it('does not automatically hammer a permanent message authorization failure', async () => {
  vi.useFakeTimers();
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  let messageRequests = 0;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (!String(input).includes('/messages?')) return originalFetch(input, init);
    messageRequests++;
    return new Response(null, { status: 403 });
  });
  try {
    await render('buyer', false, [], undefined, 0);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(messageRequests).toBe(1);
  } finally { vi.useRealTimers(); }
});

it('does not let an old send completion erase a newer draft written after returning to the chat', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  let finishSend!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { finishSend = resolve; });
  vi.mocked(fetch).mockImplementation(async (input, init) => init?.method === 'POST' && String(input).endsWith('/messages')
    ? response : originalFetch(input, init));
  await render(); await typeDraft('First message');
  await click(findButton('Xabarni yuborish'));
  await act(async () => root.render(null)); await render();
  await typeDraft('New unsent message');
  await act(async () => { finishSend(Response.json(message('sent', { senderId: 'buyer', content: 'First message' }))); });
  await act(async () => root.render(null)); await render();
  expect(messageEditor().textContent).toBe('New unsent message');
});


it('requires explicit retry after permanent message failure even after focus or reconnect', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  let messageRequests = 0;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (!String(input).includes('/messages?')) return originalFetch(input, init);
    messageRequests++;
    return new Response(null, { status: 403 });
  });
  await render('buyer', false, [], undefined, 0);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await act(async () => { focusManager.setFocused(false); onlineManager.setOnline(false); });
  await act(async () => { focusManager.setFocused(true); onlineManager.setOnline(true); });
  expect(messageRequests).toBe(1);
  await click(findButton('Xabarlarni qayta yuklash'));
  expect(messageRequests).toBe(2);
  focusManager.setFocused(undefined);
});

it('updates the pinned trade when the inbox learns that this chat was cleared and reopened', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (...args) => {
    if (String(args[0]).startsWith('/api/trade/v1/trades?')) return Response.json([{
      id: 'old-trade', sellerId: 'seller', buyerId: 'buyer', state: 'REJECTED', priceUzs: 20000,
      createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-21T10:00:00Z',
    }]);
    return originalFetch(...args);
  });
  await render('seller');
  expect(container.textContent).toContain('Oxirgi savdo:');
  await act(async () => {
    queryClient.setQueryData(chatKeys.inbox('seller'), [{ ...chat, clearedAt: '2026-09-24T09:00:00Z' }]);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(container.textContent).not.toContain('Oxirgi savdo:');
  expect(findButton('Taklif yuborish')).toBeDefined();
  await act(async () => {
    queryClient.setQueryData(chatKeys.inbox('seller'), []);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(container.textContent).not.toContain('Oxirgi savdo:');
});

it('marks only the latest displayed incoming message read when the visible chat reaches the bottom', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  try {
    await render('buyer', false, [message('incoming'), message('outgoing', { senderId: 'buyer', createdAt: '2026-09-19T10:01:00Z' })]);
    const readCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/read'));
    expect(readCalls()).toHaveLength(0);
    const list = container.querySelector('[aria-label="Xabarlar"]')!;
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 400 });
    visibility.mockReturnValue('visible');
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(readCalls()).toHaveLength(0);
    await act(async () => { list.scrollTop = 600; list.dispatchEvent(new Event('scroll')); });
    expect(readCalls()).toHaveLength(1);
    expect(JSON.parse(String(readCalls()[0][1]?.body))).toEqual({ messageId: 'incoming' });
  } finally { visibility.mockRestore(); focus.mockRestore(); }
});

it('shows online status and distinct sent/read checks only on outgoing messages', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (...args) => String(args[0]).endsWith('/activity')
    ? Response.json({ online: true, typing: false, lastSeenAt: null, lastReadAt: '2026-09-19T10:00:00Z' })
    : originalFetch(...args));
  await render('buyer', false, [
    message('read', { senderId: 'buyer' }),
    message('sent', { senderId: 'buyer', createdAt: '2026-09-19T10:01:00Z' }),
    message('received', { createdAt: '2026-09-19T10:02:00Z' }),
  ]);
  expect(container.textContent).toContain('Onlayn');
  expect(container.querySelectorAll('[aria-label="O‘qilgan"]')).toHaveLength(1);
  expect(container.querySelectorAll('[aria-label="Yuborilgan"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-new="true"]')).toHaveLength(0);
  await act(async () => {
    queryClient.setQueryData<MessageResponse[]>(chatKeys.messages('buyer', chat.id), previous => [
      ...previous!, message('new-arrival', { createdAt: '2026-09-19T10:03:00Z' }),
    ]);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(container.querySelectorAll('[data-new="true"]')).toHaveLength(1);
});

vi.mock('@/lib/chat-socket', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/chat-socket')>(),
  getChatSocket: () => socketFixture,
  closeOtherChatSockets: () => {},
}));

it('clears pinned trade history from a socket detail snapshot even when the chat disappears from the inbox', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (...args) => String(args[0]).startsWith('/api/trade/v1/trades?')
    ? Response.json([{ id: 'old-trade', sellerId: 'seller', buyerId: 'buyer', state: 'REJECTED', priceUzs: 20000,
      createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-21T10:00:00Z' }]) : originalFetch(...args));
  await render('seller'); expect(container.textContent).toContain('Oxirgi savdo:');
  await act(async () => {
    queryClient.setQueryData(chatKeys.inbox('seller'), []);
    queryClient.setQueryData(chatKeys.details('seller', 'chat'), { ...chat, clearedAt: '2026-09-25T00:00:00Z' });
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(container.textContent).not.toContain('Oxirgi savdo:');
  expect(findButton('Taklif yuborish')).toBeDefined();
});

it('shows an optimistic message and retries a failed send with its original client ID', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  const ids: string[] = [];
  let fail!: (reason: Error) => void;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (init?.method === 'POST' && String(input).endsWith('/messages')) {
      const payload = JSON.parse(String(init.body)); ids.push(payload.clientMessageId);
      if (ids.length === 1) return new Promise<Response>((_, reject) => { fail = reject; });
      return Response.json(message('delivered', { senderId: 'buyer', content: 'Optimistic hello', clientMessageId: payload.clientMessageId }));
    }
    return originalFetch(input, init);
  });
  await render(); await typeDraft('Optimistic hello'); await click(findButton('Xabarni yuborish'));
  expect(messageEditor().textContent).toBe('');
  expect(container.querySelector('[aria-label="Xabarlar"]')?.textContent).toContain('Optimistic hello');
  expect(container.textContent).toContain('Yuborilmoqda');
  await act(async () => fail(new Error('Disconnected')));
  await vi.waitFor(() => expect(findButton('Xabarni qayta yuborish')).toBeTruthy());
  await click(findButton('Xabarni qayta yuborish'));
  expect(ids).toHaveLength(2); expect(ids[0]).toBeTruthy(); expect(ids[1]).toBe(ids[0]);
  await vi.waitFor(() => expect(container.querySelectorAll('[data-message-id="delivered"]')).toHaveLength(1));
  expect(container.querySelectorAll('[data-outbox-id]')).toHaveLength(0);
});

it('searches messages and navigates replies without opening message actions', async () => {
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
  await render('buyer', false, [message('original', { content: 'Unique account' }), message('reply', { content: 'Yes', replyToId: 'original', replyPreview: 'Unique account', replySenderId: 'seller' })]);
  await click(findButton('Asl xabarga o‘tish'));
  expect(scroll).toHaveBeenCalled(); expect(dialogs()).toHaveLength(0);
  expect(container.querySelector('[data-message-id="original"]')?.getAttribute('data-highlighted')).toBe('true');
  await click(findButton('Chatda qidirish'));
  const search = container.querySelector<HTMLInputElement>('[aria-label="Xabarlarni qidirish"]')!;
  expect(search).toBeTruthy();
});

it('announces incoming messages while a failed outbox message remains and the reader is scrolled up', async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => init?.method === 'POST' && String(input).endsWith('/messages')
    ? new Response(null, { status: 503 }) : originalFetch(input, init));
  await render('buyer', false, [message('old')]);
  await typeDraft('Failed outgoing'); await click(findButton('Xabarni yuborish'));
  await vi.waitFor(() => expect(container.querySelector('[data-outbox-id]')).toBeTruthy());
  const list = container.querySelector<HTMLElement>('[aria-label="Xabarlar"]')!;
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 });
  await act(async () => { list.scrollTop = 0; list.dispatchEvent(new Event('scroll')); });
  await act(async () => queryClient.setQueryData(chatKeys.messages('buyer', chat.id), [message('old'), message('new', { createdAt: '2026-09-19T10:02:00Z' })]));
  await vi.waitFor(() => expect(findButton('Yangi xabarlar')).toBeTruthy());
});

async function touch(target: Element, type: string, points: number[][]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touches = points.map(([clientX, clientY]) => ({ clientX, clientY }));
  Object.defineProperty(event, 'touches', { value: type === 'touchend' || type === 'touchcancel' ? [] : touches });
  Object.defineProperty(event, 'changedTouches', { value: touches });
  await act(async () => { target.dispatchEvent(event); });
}
