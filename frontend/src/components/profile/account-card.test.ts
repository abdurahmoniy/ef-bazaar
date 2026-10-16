// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountCard } from './account-card';
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

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function render(over: Partial<UserAccountResponse> = {}, extras: Partial<Parameters<typeof AccountCard>[0]> = {}) {
  await act(async () => root.render(createElement(AccountCard, { account: account(over), ...extras })));
}

const button = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label) || b.getAttribute('aria-label')?.includes(label));

describe('AccountCard', () => {
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
    // Hech qanday amal yo'q: menyu, tahrir, bozorga chiqarish, email.
    expect(container.querySelector('[aria-label="Akkount amallari"]')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
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
