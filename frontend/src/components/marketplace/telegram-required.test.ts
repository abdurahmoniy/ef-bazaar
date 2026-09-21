// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { push, refresh, linkTelegramAction, getMe } = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(), linkTelegramAction: vi.fn(), getMe: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }), redirect: vi.fn() }));
vi.mock('@/app/auth/actions', () => ({ linkTelegramAction }));
vi.mock('@/lib/auth', () => ({ getMe }));
vi.mock('@/lib/marketplace-server', () => ({ getAttributeDefinitions: async () => [] }));
// Sahifa endi akkountlarni ham o'qiydi; server-only modul testda mock qilinadi.
vi.mock('@/lib/accounts-server', () => ({ getMyAccountsServer: async () => [] }));
import { ListingActions } from './listing-actions';
import { ListingForm } from './listing-form';
import { NewListingEntry } from './new-listing-entry';
import NewListingPage from '@/app/marketplace/new/page';

let host: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'chat-1' })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe('required Telegram connection', () => {
  it.each(['panel', 'bar'] as const)('blocks unlinked buyers in the %s and offers linking', async (variant) => {
    await act(async () => root.render(createElement(ListingActions, {
      listingId: 'listing-1', authenticated: true, initialLikeCount: 0, variant,
    })));
    const contact = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes("og'lanish"))!;
    await act(async () => contact.click());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Telegram akkauntingizni ulang');
    expect(document.body.textContent).toContain('sotuvchidan');
    const link = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Telegramni ulash');
    expect(link).toBeDefined();
  });

  it('keeps guests on the login flow', async () => {
    await act(async () => root.render(createElement(ListingActions, {
      listingId: 'listing-1', authenticated: false, initialLikeCount: 0,
    })));
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes("bog'lanish"))!.click());
    expect(push).toHaveBeenCalledWith('/auth/login?from=/marketplace/listing-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets a linked buyer open the chat', async () => {
    await act(async () => root.render(createElement(ListingActions, {
      listingId: 'listing-1', authenticated: true, telegramLinked: true, initialLikeCount: 0,
    })));
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes("bog'lanish"))!.click());
    expect(push).toHaveBeenCalledWith('/chats/chat-1');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows the requirement if the backend rejects stale linked status', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'telegram_required' }), { status: 403 }));
    await act(async () => root.render(createElement(ListingActions, {
      listingId: 'listing-1', authenticated: true, telegramLinked: true, initialLikeCount: 0,
    })));
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes("bog'lanish"))!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Telegramni ulash');
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps the gate on linking failure and resumes contact after a verified refresh', async () => {
    const render = async (telegramLinked = false) => {
      await act(async () => root.render(createElement(ListingActions, {
        listingId: 'listing-1', authenticated: true, telegramLinked, botUsername: 'test_bot', initialLikeCount: 0,
      })));
    };
    await render();
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes("bog'lanish"))!.click());
    await act(async () => Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Telegramni ulash')!.click());
    const script = document.querySelector('script[data-telegram-login="test_bot"]')!;
    expect(script.getAttribute('data-request-access')).toBe('write');
    const callback = script.getAttribute('data-onauth')!.split('(')[0];
    const authenticate = () => (window as unknown as Record<string, (data: unknown) => Promise<void>>)[callback]({ id: 123 });
    linkTelegramAction.mockResolvedValue({ ok: false, error: 'Telegram boshqa hisobga ulangan' });
    await act(authenticate);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Telegram boshqa hisobga ulangan');
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    linkTelegramAction.mockResolvedValue({ ok: true });
    await act(authenticate);
    expect(refresh).toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await render(true);
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes("bog'lanish"))!.click());
    expect(push).toHaveBeenCalledWith('/chats/chat-1');
  });

  it.each([false, true])('only exposes listing creation when Telegram is linked: %s', async (telegramLinked) => {
    getMe.mockResolvedValue({ id: 'user-1', telegramLinked });
    const page = await NewListingPage();
    const content = page.props.children.props.children;
    // Sahifa endi formani to'g'ridan-to'g'ri emas, kirish qadami orqali
    // ko'rsatadi: "akkountlarimdan tanlash" yoki "yangi ma'lumot".
    expect(content.some((child: { type?: unknown }) => child?.type === NewListingEntry)).toBe(telegramLinked);
  });
});
