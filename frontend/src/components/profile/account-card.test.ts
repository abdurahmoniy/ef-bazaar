// @vitest-environment jsdom

import { act, createElement, Fragment, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountCard } from './account-card';
import { PublishAccountDialog } from './publish-account-dialog';
import type { UserAccountResponse } from '@/lib/accounts-types';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  deleteAccount: vi.fn(),
  unpublishAccount: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock('@/lib/accounts-client', () => ({
  deleteAccount: mocks.deleteAccount,
  unpublishAccount: mocks.unpublishAccount,
}));

const account = (over: Partial<UserAccountResponse> = {}): UserAccountResponse => ({
  id: 'acc-1',
  title: 'Asosiy akkount',
  description: 'Akkount tavsifi',
  attributes: { platform: 'MOBILE', highest_division_level: 3, team_strength: 3150, device_transfer_limit: 5 },
  mediaMessageIds: [],
  email: 'a7f2@efbazaar.uz',
  emailSource: 'PLATFORM', emailVerified: false,
  status: 'ACTIVE',
  onMarket: false,
  currentListingId: null,
  createdAt: '2026-09-18T00:00:00Z',
  updatedAt: '2026-09-18T00:00:00Z',
  ...over,
});

let container: HTMLDivElement;
let root: Root;
let desktop = false;
const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  desktop = false;
  mediaListeners.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: desktop,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.delete(listener),
  })));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(over: Partial<UserAccountResponse> = {}, extras: Partial<Parameters<typeof AccountCard>[0]> = {}, expanded = true) {
  await act(async () => root.render(createElement(AccountCard, { account: account(over), ...extras })));
  if (expanded && disclosure()!.getAttribute('aria-expanded') === 'false') {
    await act(async () => disclosure()!.click());
  }
}

const disclosure = () => container.querySelector<HTMLButtonElement>('h2 button[aria-expanded]');
const button = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label) || b.getAttribute('aria-label')?.includes(label));

describe('AccountCard', () => {
  it('opens desktop details in a labelled popup outside the card grid', async () => {
    desktop = true;
    await render({}, { display: { mailboxHref: '/mail/owned-1', price: 150000 } });
    const popup = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(popup).not.toBeNull();
    expect(popup!.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(popup!.getAttribute('aria-labelledby')!)?.textContent).toBe('Asosiy akkount');
    expect(container.contains(popup)).toBe(false);
    expect(container.textContent).not.toContain('Mobile');
    expect(popup!.textContent).toContain('Mobile');
    expect(popup!.querySelector('a[href="/mail/owned-1"]')).not.toBeNull();
    expect(disclosure()!.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('dismisses the desktop popup with Escape, restores focus and masks email on reopening', async () => {
    desktop = true;
    await render();
    let popup = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(popup).not.toBeNull();
    await act(async () => popup!.querySelector<HTMLButtonElement>('[aria-label="Emailni ko‘rsatish"]')!.click());
    expect(popup!.textContent).toContain('a7f2@efbazaar.uz');
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(disclosure()!.getAttribute('aria-expanded')).toBe('false');
    await vi.waitFor(() => expect(document.activeElement).toBe(disclosure()));
    await act(async () => disclosure()!.click());
    popup = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(popup!.textContent).not.toContain('a7f2@efbazaar.uz');
  });

  it('keeps keyboard focus inside the desktop popup', async () => {
    desktop = true;
    await render();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      await act(async () => outside.focus());
      const popup = document.querySelector('[role="dialog"]')!;
      expect(popup).not.toBeNull();
      expect(disclosure()!.getAttribute('aria-expanded')).toBe('true');
      expect(popup.contains(document.activeElement)).toBe(true);
    } finally {
      outside.remove();
    }
  });

  it('closes desktop details before opening the publishing form', async () => {
    desktop = true;
    const onPublish = vi.fn();
    await render({}, { onPublish });
    const popup = document.querySelector('[role="dialog"]')!;
    const publish = Array.from(popup.querySelectorAll('button')).find(node => node.textContent === 'Bozorga chiqarish')!;
    await act(async () => publish.click());
    await vi.waitFor(() => expect(onPublish).toHaveBeenCalledExactlyOnceWith(account()));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(disclosure()!.getAttribute('aria-expanded')).toBe('false');
  });

  it('focuses the publishing form after the desktop popup finishes closing', async () => {
    vi.useFakeTimers();
    desktop = true;
    function PublishingCard() {
      const [publishing, setPublishing] = useState(false);
      return createElement(Fragment, null,
        createElement(AccountCard, { account: account(), onPublish: () => setPublishing(true) }),
        publishing && createElement(PublishAccountDialog, { account: account(), onClose: () => setPublishing(false) }),
      );
    }
    await act(async () => root.render(createElement(PublishingCard)));
    await act(async () => disclosure()!.click());
    const publish = Array.from(document.querySelectorAll('[role="dialog"] button')).find(node => node.textContent === 'Bozorga chiqarish') as HTMLButtonElement;
    await act(async () => publish.click());
    await act(async () => vi.runAllTimersAsync());
    expect(document.querySelector('[role="dialog"] input')).not.toBeNull();
    expect(document.activeElement).toBe(document.querySelector('[role="dialog"] input'));
  });

  it('closes desktop details when changing to the mobile inline layout', async () => {
    desktop = true;
    await render();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    desktop = false;
    await act(async () => mediaListeners.forEach(listener => listener({ matches: false } as MediaQueryListEvent)));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(disclosure()!.getAttribute('aria-expanded')).toBe('false');
    await act(async () => disclosure()!.click());
    expect(container.textContent).toContain('Mobile');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows sold history in a desktop popup without account actions', async () => {
    desktop = true;
    await render({ status: 'ARCHIVED', archivedReason: 'SOLD_ON_PLATFORM', soldPrice: 150000 });
    const popup = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(popup).not.toBeNull();
    expect(popup!.textContent).toContain("150 000 so'm");
    expect(popup!.querySelector('a, [aria-label="Akkount amallari"], [aria-label="Emailni ko‘rsatish"]')).toBeNull();
    expect(popup!.querySelectorAll('button')).toHaveLength(1);
  });

  it('closes the action menu and confirmation before dismissing the desktop popup with Escape', async () => {
    desktop = true;
    await render();
    const popup = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const menu = popup.querySelector<HTMLButtonElement>('[aria-label="Akkount amallari"]')!;
    await act(async () => menu.click());
    await act(async () => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[role="dialog"]')).toBe(popup);
    await act(async () => menu.click());
    const remove = Array.from(popup.querySelectorAll('button')).find(node => node.textContent === "O'chirish")!;
    await act(async () => remove.click());
    expect(popup.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(popup.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBe(popup);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it('keeps a pending desktop action visible until the response arrives', async () => {
    desktop = true;
    let finish!: (result: { ok: boolean; message?: string }) => void;
    mocks.unpublishAccount.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await render({ onMarket: true });
    const popup = document.querySelector<HTMLElement>('[role="dialog"]')!;
    await act(async () => popup.querySelector<HTMLButtonElement>('[aria-label="Akkount amallari"]')!.click());
    const remove = Array.from(popup.querySelectorAll('button')).find(node => node.textContent === 'Bozordan olish')!;
    await act(async () => remove.click());
    const confirm = Array.from(popup.querySelectorAll('button')).find(node => node.textContent === 'Ha, bozordan olish')!;
    await act(async () => confirm.click());
    expect(popup.querySelector<HTMLButtonElement>('[aria-label="Tafsilotlarni yopish"]')!.disabled).toBe(true);
    await act(async () => confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(document.querySelector('[role="dialog"]')).toBe(popup);
    await act(async () => finish({ ok: false, message: 'Qayta urinib ko‘ring.' }));
    expect(popup.querySelector('[role="alert"]')?.textContent).toBe('Qayta urinib ko‘ring.');
    expect(popup.querySelector<HTMLButtonElement>('[aria-label="Tafsilotlarni yopish"]')!.disabled).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each([
    [{ onMarket: true }, 'Bozorda'],
    [{ onMarket: false }, 'Bozorda emas'],
    [{ status: 'ARCHIVED', archivedReason: 'SOLD_ON_PLATFORM' }, 'Sotilgan'],
    [{ status: 'ARCHIVED', archivedReason: 'SWAPPED_ON_PLATFORM' }, 'Almashtirilgan'],
  ] as [Partial<UserAccountResponse>, string][])('announces the status of a collapsed account: %s', async (over, status) => {
    await render(over, {}, false);
    expect(disclosure()?.getAttribute('aria-label')).toContain(status);
  });

  it('starts collapsed with a photo, name and status while keeping details and actions out of the main view', async () => {
    await render({ mediaMessageIds: ['photo-1'], onMarket: true, currentListingId: 'listing-1' }, {
      display: { price: 150000, mailboxHref: '/mail/owned-1' },
    }, false);
    expect(disclosure()).not.toBeNull();
    expect(disclosure()!.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure()!.textContent).toContain('Asosiy akkount');
    expect(disclosure()!.textContent).toContain('Bozorda');
    expect(disclosure()!.querySelector('img')?.getAttribute('src')).toContain('/photo-1');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).not.toContain('Mobile');
    expect(container.textContent).not.toContain('150 000');
    expect(container.textContent).not.toContain('••••');
  });

  it('fills the listing-style preview area with the account image', async () => {
    await render({ mediaMessageIds: ['photo-1'] }, {}, false);
    const image = disclosure()!.querySelector('img')!;
    expect(image.classList.contains('object-cover')).toBe(true);
    expect(image.parentElement!.classList.contains('aspect-[4/3]')).toBe(true);
    expect(image.parentElement!.classList.contains('overflow-hidden')).toBe(true);
  });

  it('opens each card independently and connects its toggle to its own details', async () => {
    await act(async () => root.render(createElement(Fragment, null,
      createElement(AccountCard, { account: account() }),
      createElement(AccountCard, { account: account({ id: 'acc-2', title: 'Ikkinchi akkount' }) }),
    )));
    const toggles = container.querySelectorAll<HTMLButtonElement>('h2 button[aria-expanded]');
    expect(toggles).toHaveLength(2);
    const firstId = toggles[0].getAttribute('aria-controls')!;
    const secondId = toggles[1].getAttribute('aria-controls')!;
    expect(firstId).not.toBe(secondId);
    expect(document.getElementById(firstId)?.hidden).toBe(true);
    expect(document.getElementById(secondId)?.hidden).toBe(true);
    await act(async () => toggles[0].click());
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(firstId)?.hidden).toBe(false);
    expect(document.getElementById(firstId)?.textContent).toContain('Mobile');
    expect(toggles[1].getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(secondId)?.hidden).toBe(true);
  });

  it('clears exposed email and unconfirmed actions when the card is collapsed', async () => {
    await render();
    await act(async () => button('Emailni ko‘rsatish')!.click());
    expect(container.textContent).toContain('a7f2@efbazaar.uz');
    await act(async () => button('Akkount amallari')!.click());
    await act(async () => button("O'chirish")!.click());
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(async () => disclosure()!.click());
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
    await act(async () => disclosure()!.click());
    expect(container.textContent).not.toContain('a7f2@efbazaar.uz');
    expect(button('Emailni ko‘rsatish')).toBeDefined();
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(button("O'chirish")).toBeUndefined();
  });

  it('keeps a sold card compact until its read-only history is opened', async () => {
    await render({ status: 'ARCHIVED', archivedReason: 'SOLD_ON_PLATFORM', soldPrice: 150000,
      archivedAt: '2026-10-06T18:34:00Z' }, {}, false);
    expect(disclosure()?.textContent).toContain('Sotilgan');
    expect(container.textContent).not.toContain('06.10.2026');
    expect(container.textContent).not.toContain("150 000 so'm");
    await act(async () => disclosure()!.click());
    expect(container.textContent).toContain('06.10.2026');
    expect(container.textContent).toContain("150 000 so'm");
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).not.toContain('a7f2@efbazaar.uz');
  });

  it('still opens the details when the account image fails to load', async () => {
    await render({ mediaMessageIds: ['broken-photo'] }, {}, false);
    const image = container.querySelector('img')!;
    await act(async () => image.dispatchEvent(new Event('error')));
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('Asosiy akkount');
    await act(async () => disclosure()!.click());
    expect(button('Bozorga chiqarish')).toBeDefined();
  });

  it('keeps the email masked until it is revealed', async () => {
    await render();
    expect(container.textContent).not.toContain('a7f2@efbazaar.uz');

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Emailni ko‘rsatish"]')!.click());

    expect(container.textContent).toContain('a7f2@efbazaar.uz');
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Emailni yashirish"]')!.click());
    expect(container.textContent).not.toContain('a7f2@efbazaar.uz');
  });

  it('offers labelled compact email controls beside a private email', async () => {
    await render({}, { display: { mailboxHref: '/mail/owned-1' } });
    const reveal = container.querySelector<HTMLButtonElement>('[aria-label="Emailni ko‘rsatish"]');
    const copy = container.querySelector<HTMLButtonElement>('[aria-label="Emailni nusxalash"]');
    expect(reveal).not.toBeNull();
    expect(copy).not.toBeNull();
    expect(reveal!.textContent).toBe('');
    await act(async () => reveal!.click());
    expect(container.textContent).toContain('a7f2@efbazaar.uz');
    expect(container.querySelector('[aria-label="Emailni yashirish"]')).not.toBeNull();
    const mailbox = container.querySelector('a[href="/mail/owned-1"]');
    expect(mailbox?.parentElement).toBe(button('Bozorga chiqarish')?.parentElement);
  });

  it('shows the Bozorda badge and hides delete while published', async () => {
    await render({ onMarket: true, currentListingId: 'listing-1' });

    expect(container.textContent).toContain('Bozorda');
    expect(button("O'chirish")).toBeUndefined();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Akkount amallari"]')!.click());
    expect(button('Bozordan olish')).toBeDefined();
  });

  it('shows a sold account as read-only history with its date and price', async () => {
    await render({
      status: 'ARCHIVED', archivedReason: 'SOLD_ON_PLATFORM', email: null, emailSource: null,
      archivedAt: '2026-10-06T18:34:00Z', soldPrice: 150000,
    }, { onPublish: vi.fn(), onTogglePin: vi.fn() });

    expect(container.textContent).toContain('Sotilgan');
    expect(container.textContent).toContain('06.10.2026');
    expect(container.textContent).toContain("150 000 so'm");
    expect(container.querySelector('article')?.dataset.state).toBe('sold');
    // Faqat tafsilotlarni ochish/yopish: menyu, tahrir, email va sotuv amallari yo'q.
    expect(container.querySelector('[aria-label="Akkount amallari"]')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.textContent).not.toContain('Email biriktirilmagan');
  });

  it('labels a swapped account and leaves out a price it never had', async () => {
    await render({
      status: 'ARCHIVED', archivedReason: 'SWAPPED_ON_PLATFORM', email: null,
      archivedAt: '2026-10-01T09:00:00Z', soldPrice: null,
    });

    expect(container.textContent).toContain('Almashtirilgan');
    expect(container.textContent).toContain('01.10.2026');
    expect(container.textContent).not.toContain("so'm");
  });

  it('offers publishing when the account is idle', async () => {
    await render();
    expect(button('Bozorga chiqarish')).toBeDefined();
    expect(button('Bozordan olish')).toBeUndefined();
  });

  it('sends incomplete accounts to the editor instead of publishing', async () => {
    const onPublish = vi.fn();
    await render({ attributes: {} }, { onPublish });
    expect(container.textContent).toContain("Ma'lumot to'ldirilmagan");
    expect(button('Bozorga chiqarish')).toBeUndefined();
    expect(container.querySelector('a[href="/profile/accounts/acc-1"]')?.textContent).toContain('Ma’lumotlarni to‘ldirish');
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('summarises the account attributes', async () => {
    await render();
    expect(container.textContent).toContain('Mobile');
    expect(container.textContent).toContain('D3');
    expect(container.textContent).toContain('3150');
  });

  it('says so when no email is attached', async () => {
    await render({ email: null, emailSource: null });
    expect(container.textContent).toContain('Email biriktirilmagan');
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Emailni ko‘rsatish"]')).toBeNull();
  });

  it('copies without revealing the email and reports clipboard failures', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await render();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Emailni nusxalash"]')!.click());
    expect(writeText).toHaveBeenCalledWith('a7f2@efbazaar.uz');
    expect(container.textContent).not.toContain('a7f2@efbazaar.uz');
    expect(container.textContent).toContain('Nusxalandi');
    writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Emailni nusxalash"]')!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Nusxalab');
  });

  it('requires confirmation before removing a listing, and cancellation changes nothing', async () => {
    await render({ onMarket: true, currentListingId: 'listing-1' });
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Akkount amallari"]')!.click());
    await act(async () => button('Bozordan olish')!.click());
    expect(mocks.unpublishAccount).not.toHaveBeenCalled();
    await act(async () => button('Bekor qilish')!.click());
    expect(mocks.unpublishAccount).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Akkount amallari"]')!.click());
    await act(async () => button('Bozordan olish')!.click());
    mocks.unpublishAccount.mockResolvedValueOnce({ ok: true });
    await act(async () => button('Ha, bozordan olish')!.click());
    expect(mocks.unpublishAccount).toHaveBeenCalledWith('acc-1');
  });

  it('uses only supplied owned mailbox links and shows the current price', async () => {
    await render({ onMarket: true }, { display: { mailboxHref: '/mail/owned-1', price: 150000 } });
    expect(container.querySelector('a[href="/mail/owned-1"]')?.textContent).toContain('Pochtani ochish');
    expect(container.textContent?.replace(/\s/g, '')).toContain('150000');
    await render();
    expect(container.textContent).not.toContain('Pochtani ochish');
    expect(container.textContent).toContain('Bozorda emas');
  });

  it('restores focus after an asynchronous unpublish finishes', async () => {
    let finish!: (result: { ok: boolean }) => void;
    mocks.unpublishAccount.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await render({ onMarket: true });
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Akkount amallari"]')!;
    await act(async () => trigger.click());
    await act(async () => button('Bozordan olish')!.click());
    expect(document.activeElement).toBe(button('Bekor qilish'));
    await act(async () => { button('Ha, bozordan olish')!.focus(); button('Ha, bozordan olish')!.click(); });
    expect(trigger.disabled).toBe(true);
    expect(disclosure()!.disabled).toBe(true);
    await act(async () => finish({ ok: true }));
    expect(document.activeElement).toBe(trigger);
  });
});

describe('email badges', () => {
  const link = (label: string) =>
    Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes(label));

  it('shows the verified mark and the gold border for a custom address', async () => {
    await render({ email: 'alibek1@efbazaar.uz', emailSource: 'CUSTOM', emailVerified: true });

    expect(container.querySelector('[aria-label="Tasdiqlangan email"]')).toBeTruthy();
    expect(container.querySelector('article')?.className).toContain('gold-ring');
  });

  it('keeps the custom border visible when collapsed and the verification mark in the desktop popup', async () => {
    desktop = true;
    await render({ email: 'alibek1@efbazaar.uz', emailSource: 'CUSTOM', emailVerified: true }, {}, false);
    expect(container.querySelector('article')?.className).toContain('gold-ring');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => disclosure()!.click());
    expect(document.querySelector('[role="dialog"] [aria-label="Tasdiqlangan email"]')).not.toBeNull();
  });

  it('marks a trade address verified without the gold border', async () => {
    await render({ email: 'trade-1@efbazaar.uz', emailSource: 'PLATFORM', emailVerified: true });

    expect(container.querySelector('[aria-label="Tasdiqlangan email"]')).toBeTruthy();
    expect(container.querySelector('article')?.className).not.toContain('gold-ring');
  });

  it('offers a custom address when the account has none', async () => {
    await render({ email: null, emailSource: null });

    expect(link('O‘zingiz tanlagan email biriktiring')?.getAttribute('href')).toBe('/mailboxes/custom?accountId=acc-1');
  });

  it('offers verification for the user’s own box', async () => {
    await render({ email: 'sardor10@efbazaar.uz', emailSource: 'MANUAL' }, { display: { verifyMailboxId: 'box-9' } });

    expect(link('Tasdiqlash')?.getAttribute('href')).toBe('/mailboxes/custom/box-9/link?verify=1&accountId=acc-1');
    expect(container.querySelector('[aria-label="Tasdiqlangan email"]')).toBeNull();
  });
});
