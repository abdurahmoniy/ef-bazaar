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

async function render(over: Partial<UserAccountResponse> = {}, extras: Partial<Parameters<typeof AccountCard>[0]> = {}, expanded = true, actions = true) {
  await act(async () => root.render(createElement(AccountCard, { account: account(over), ...extras })));
  if (expanded && disclosure()!.getAttribute('aria-expanded') === 'false') {
    await act(async () => disclosure()!.click());
  }
  const controls = button('Email va amallar');
  if (expanded && actions && controls?.getAttribute('aria-expanded') === 'false') {
    await act(async () => controls.click());
  }
}

const disclosure = () => container.querySelector<HTMLButtonElement>('h2 button[aria-expanded]');
const content = () => document.querySelector<HTMLElement>('[role="dialog"]') ?? container;
const button = (label: string) =>
  Array.from(content().querySelectorAll('button')).find((b) => b.textContent?.includes(label) || b.getAttribute('aria-label')?.includes(label));

describe('AccountCard', () => {
  function dragHandle() {
    const handle = content().querySelector<HTMLElement>('[data-sheet-drag-handle]')!;
    expect(handle).not.toBeNull();
    Object.defineProperties(handle, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    vi.spyOn(content(), 'getBoundingClientRect').mockReturnValue({ height: 480 } as DOMRect);
    return handle;
  }
  async function pointer(target: HTMLElement, type: string, x: number, y: number, time = 0) {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, 'timeStamp', { value: time });
    await act(async () => target.dispatchEvent(event));
  }

  it('follows a downward drag and dismisses the mobile sheet with focus restored', async () => {
    await render({}, {}, true, false);
    const handle = dragHandle();
    await pointer(handle, 'pointerdown', 100, 100, 0);
    await pointer(handle, 'pointermove', 100, 230, 300);
    expect(content().style.transform).toContain('130px');
    await pointer(handle, 'pointerup', 100, 230, 400);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(disclosure()));
    await act(async () => disclosure()!.click());
    expect(content().style.transform).toBe('');
  });

  it('dismisses a quick downward flick shorter than the distance threshold', async () => {
    await render({}, {}, true, false);
    const handle = dragHandle();
    await pointer(handle, 'pointerdown', 100, 100, 0);
    await pointer(handle, 'pointermove', 100, 160, 30);
    await pointer(handle, 'pointerup', 100, 160, 60);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('resets a drag when pointer capture is interrupted', async () => {
    await render({}, {}, true, false);
    const handle = dragHandle();
    await pointer(handle, 'pointerdown', 100, 100, 0);
    await pointer(handle, 'pointermove', 100, 160, 300);
    await pointer(handle, 'lostpointercapture', 100, 160, 400);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(content().style.transform).toBe('');
  });

  it.each(['short', 'up', 'horizontal', 'cancel'])('returns the sheet to its position after a %s gesture', async (kind) => {
    await render({}, {}, true, false);
    const handle = dragHandle();
    await pointer(handle, 'pointerdown', 100, 100, 0);
    const x = kind === 'horizontal' ? 300 : 100;
    const y = kind === 'up' ? 10 : kind === 'short' ? 125 : 230;
    await pointer(handle, 'pointermove', x, y, 400);
    await pointer(handle, kind === 'cancel' ? 'pointercancel' : 'pointerup', x, y, 600);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(content().style.transform).toBe('');
    expect(disclosure()!.getAttribute('aria-expanded')).toBe('true');
  });

  it('does not turn a scroll gesture in the sheet body into dismissal', async () => {
    await render({}, {}, true, false);
    const body = content().querySelector('dl')!;
    await pointer(body, 'pointerdown', 100, 100, 0);
    await pointer(body, 'pointermove', 100, 270, 300);
    await pointer(body, 'pointerup', 100, 270, 500);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(content().style.transform).toBe('');
  });

  it('does not add a drag handle to the desktop popup', async () => {
    desktop = true;
    await render();
    expect(content().querySelector('[data-sheet-drag-handle]')).toBeNull();
  });

  it('opens mobile details in a labelled modal with separate fact rows and a Done action', async () => {
    await render({ onMarket: true, mediaMessageIds: ['photo-1'] }, { display: { price: 150000 } }, true, false);
    const sheet = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(sheet).not.toBeNull();
    expect(sheet!.getAttribute('aria-modal')).toBe('true');
    expect(container.contains(sheet)).toBe(false);
    expect(container.textContent).not.toContain('Mobile');
    expect(Array.from(sheet!.querySelectorAll('dt')).map(node => node.textContent)).toEqual(['Platforma', 'Jamoa kuchi', 'Holat']);
    expect(sheet!.querySelector('[aria-label="Emailni ko‘rsatish"]')).toBeNull();
    expect(button('Email va amallar')).toBeDefined();
    expect(sheet!.querySelector('img')?.getAttribute('src')).toContain('/photo-1');
    expect(sheet!.querySelector('[data-sheet-drag-handle]')!.firstElementChild!.contains(sheet!.querySelector('img'))).toBe(true);
    expect(sheet!.style.animationDuration).toBe('320ms');
    expect(sheet!.textContent).toContain("150 000 so'm");
    const done = Array.from(sheet!.querySelectorAll('button')).find(node => node.textContent === 'Tayyor')!;
    await act(async () => done.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(disclosure()));
  });

  it('keeps the main facts visible while hiding and resetting private controls', async () => {
    await render();
    await act(async () => button('Emailni ko‘rsatish')!.click());
    expect(content().textContent).toContain('a7f2@efbazaar.uz');
    await act(async () => button('Email va amallar')!.click());
    expect(button('Emailni ko‘rsatish')).toBeUndefined();
    expect(content().textContent).not.toContain('a7f2@efbazaar.uz');
    expect(content().textContent).toContain('Mobile');
    expect(button('Tayyor')).toBeDefined();
    await act(async () => button('Email va amallar')!.click());
    expect(button('Emailni ko‘rsatish')).toBeDefined();
    expect(content().textContent).not.toContain('a7f2@efbazaar.uz');
  });

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

  it.each([false, true])('keeps keyboard focus inside details (desktop: %s)', async (wide) => {
    desktop = wide;
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

  it.each([false, true])('focuses the publishing form after closing details (desktop: %s)', async (wide) => {
    vi.useFakeTimers();
    desktop = wide;
    function PublishingCard() {
      const [publishing, setPublishing] = useState(false);
      return createElement(Fragment, null,
        createElement(AccountCard, { account: account(), onPublish: () => setPublishing(true) }),
        publishing && createElement(PublishAccountDialog, { account: account(), onClose: () => setPublishing(false) }),
      );
    }
    await act(async () => root.render(createElement(PublishingCard)));
    await act(async () => disclosure()!.click());
    if (!wide) await act(async () => button('Email va amallar')!.click());
    const publish = Array.from(document.querySelectorAll('[role="dialog"] button')).find(node => node.textContent === 'Bozorga chiqarish') as HTMLButtonElement;
    await act(async () => publish.click());
    await act(async () => vi.runAllTimersAsync());
    expect(document.querySelector('[role="dialog"] input')).not.toBeNull();
    expect(document.activeElement).toBe(document.querySelector('[role="dialog"] input'));
  });

  it('closes desktop details when changing to the mobile sheet layout', async () => {
    desktop = true;
    await render();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    desktop = false;
    await act(async () => mediaListeners.forEach(listener => listener({ matches: false } as MediaQueryListEvent)));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(disclosure()!.getAttribute('aria-expanded')).toBe('false');
    await act(async () => disclosure()!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Mobile');
    expect(container.textContent).not.toContain('Mobile');
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

  it.each([false, true])('keeps pending actions visible until the response arrives (desktop: %s)', async (wide) => {
    desktop = wide;
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
    if (!wide) {
      const handle = dragHandle();
      await pointer(handle, 'pointerdown', 100, 100, 0);
      await pointer(handle, 'pointermove', 100, 250, 300);
      await pointer(handle, 'pointerup', 100, 250, 500);
      expect(document.querySelector('[role="dialog"]')).toBe(popup);
      expect(popup.style.transform).toBe('');
      expect(button('Email va amallar')!.disabled).toBe(true);
      expect(button('Tayyor')!.disabled).toBe(true);
      await act(async () => button('Tayyor')!.click());
      expect(document.querySelector('[role="dialog"]')).toBe(popup);
    }
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

  it('keeps the desktop listing-style preview area filled with the account image', async () => {
    desktop = true;
    await render({ mediaMessageIds: ['photo-1'] }, {}, false);
    const image = disclosure()!.querySelector('img')!;
    expect(image.classList.contains('object-cover')).toBe(true);
    expect(image.parentElement!.classList.contains('aspect-[4/3]')).toBe(true);
    expect(image.parentElement!.classList.contains('overflow-hidden')).toBe(true);
  });

  it.each([
    { fields: { onMarket: true }, label: 'Bozorda' },
    { fields: { onMarket: false }, label: 'Bozorda emas' },
    { fields: { status: 'ARCHIVED', archivedReason: 'SOLD_ON_PLATFORM' }, label: 'Sotilgan' },
  ] satisfies { fields: Partial<UserAccountResponse>; label: string }[])('places the mobile status beside the thumbnail instead of over it: $label', async ({ fields, label }) => {
    await render({ ...fields, mediaMessageIds: ['photo-1'] }, { pinned: true }, false);
    const toggle = disclosure()!;
    const thumbnail = toggle.querySelector('img')!.parentElement!;
    expect(toggle.textContent).toContain(label);
    expect(thumbnail.textContent).not.toContain(label);
    expect(toggle.textContent).not.toContain('Tafsilotlarni ko‘rish');
    expect(toggle.getAttribute('aria-label')).toContain('Tafsilotlar');
    expect(container.querySelector('a')).toBeNull();
  });

  it('keeps the mobile missing-image placeholder short enough for a thumbnail', async () => {
    await render({}, {}, false);
    expect(disclosure()!.textContent).toContain('Asosiy akkount');
    expect(disclosure()!.textContent).not.toContain('Rasm qo‘shilmagan');
    expect(disclosure()!.getAttribute('aria-expanded')).toBe('false');
    await act(async () => disclosure()!.click());
    await act(async () => button('Email va amallar')!.click());
    expect(button('Bozorga chiqarish')).toBeDefined();
  });

  it('opens each card independently and connects its toggle to its own modal', async () => {
    await act(async () => root.render(createElement(Fragment, null,
      createElement(AccountCard, { account: account() }),
      createElement(AccountCard, { account: account({ id: 'acc-2', title: 'Ikkinchi akkount' }) }),
    )));
    const toggles = container.querySelectorAll<HTMLButtonElement>('h2 button[aria-expanded]');
    expect(toggles).toHaveLength(2);
    const firstId = toggles[0].getAttribute('aria-controls')!;
    const secondId = toggles[1].getAttribute('aria-controls')!;
    expect(firstId).not.toBe(secondId);
    expect(document.getElementById(firstId)).toBeNull();
    expect(document.getElementById(secondId)).toBeNull();
    await act(async () => toggles[0].click());
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(firstId)?.getAttribute('role')).toBe('dialog');
    expect(document.getElementById(firstId)?.textContent).toContain('Mobile');
    expect(toggles[1].getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(secondId)).toBeNull();
    await act(async () => button('Tayyor')!.click());
    await act(async () => toggles[1].click());
    expect(document.getElementById(firstId)).toBeNull();
    expect(document.getElementById(secondId)?.textContent).toContain('Ikkinchi akkount');
  });

  it('clears exposed email and unconfirmed actions when the card is collapsed', async () => {
    await render();
    await act(async () => button('Emailni ko‘rsatish')!.click());
    expect(content().textContent).toContain('a7f2@efbazaar.uz');
    await act(async () => button('Akkount amallari')!.click());
    await act(async () => button("O'chirish")!.click());
    expect(content().querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(async () => button('Tayyor')!.click());
    expect(content().querySelector('[role="alertdialog"]')).toBeNull();
    expect(content().querySelectorAll('button')).toHaveLength(1);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
    await act(async () => disclosure()!.click());
    expect(content().textContent).not.toContain('a7f2@efbazaar.uz');
    await act(async () => button('Email va amallar')!.click());
    expect(button('Emailni ko‘rsatish')).toBeDefined();
    expect(content().querySelector('[role="alertdialog"]')).toBeNull();
    expect(button("O'chirish")).toBeUndefined();
  });

  it('keeps a sold card compact until its read-only history is opened', async () => {
    await render({ status: 'ARCHIVED', archivedReason: 'SOLD_ON_PLATFORM', soldPrice: 150000,
      archivedAt: '2026-10-06T18:34:00Z' }, {}, false);
    expect(disclosure()?.textContent).toContain('Sotilgan');
    expect(content().textContent).not.toContain('06.10.2026');
    expect(content().textContent).not.toContain("150 000 so'm");
    await act(async () => disclosure()!.click());
    expect(content().textContent).toContain('06.10.2026');
    expect(content().textContent).toContain("150 000 so'm");
    expect(content().querySelectorAll('button')).toHaveLength(2);
    expect(content().querySelector('a')).toBeNull();
    expect(content().textContent).not.toContain('a7f2@efbazaar.uz');
  });

  it('still opens the details when the account image fails to load', async () => {
    await render({ mediaMessageIds: ['broken-photo'] }, {}, false);
    const image = content().querySelector('img')!;
    await act(async () => image.dispatchEvent(new Event('error')));
    expect(content().querySelector('img')).toBeNull();
    expect(content().textContent).toContain('Asosiy akkount');
    await act(async () => disclosure()!.click());
    await act(async () => button('Email va amallar')!.click());
    expect(button('Bozorga chiqarish')).toBeDefined();
  });

  it('keeps the email masked until it is revealed', async () => {
    await render();
    expect(content().textContent).not.toContain('a7f2@efbazaar.uz');

    await act(async () => content().querySelector<HTMLButtonElement>('[aria-label="Emailni ko‘rsatish"]')!.click());

    expect(content().textContent).toContain('a7f2@efbazaar.uz');
    await act(async () => content().querySelector<HTMLButtonElement>('[aria-label="Emailni yashirish"]')!.click());
    expect(content().textContent).not.toContain('a7f2@efbazaar.uz');
  });

  it('offers labelled compact email controls beside a private email', async () => {
    await render({}, { display: { mailboxHref: '/mail/owned-1' } });
    const reveal = content().querySelector<HTMLButtonElement>('[aria-label="Emailni ko‘rsatish"]');
    const copy = content().querySelector<HTMLButtonElement>('[aria-label="Emailni nusxalash"]');
    expect(reveal).not.toBeNull();
    expect(copy).not.toBeNull();
    expect(reveal!.textContent).toBe('');
    await act(async () => reveal!.click());
    expect(content().textContent).toContain('a7f2@efbazaar.uz');
    expect(content().querySelector('[aria-label="Emailni yashirish"]')).not.toBeNull();
    const mailbox = content().querySelector('a[href="/mail/owned-1"]');
    expect(mailbox?.parentElement).toBe(button('Bozorga chiqarish')?.parentElement);
  });

  it('shows the Bozorda badge and hides delete while published', async () => {
    await render({ onMarket: true, currentListingId: 'listing-1' });

    expect(content().textContent).toContain('Bozorda');
    expect(button("O'chirish")).toBeUndefined();
    await act(async () => content().querySelector<HTMLButtonElement>('[aria-label="Akkount amallari"]')!.click());
    expect(button('Bozordan olish')).toBeDefined();
  });

  it('shows a sold account as read-only history with its date and price', async () => {
    await render({
      status: 'ARCHIVED', archivedReason: 'SOLD_ON_PLATFORM', email: null, emailSource: null,
      archivedAt: '2026-10-06T18:34:00Z', soldPrice: 150000,
    }, { onPublish: vi.fn(), onTogglePin: vi.fn() });

    expect(content().textContent).toContain('Sotilgan');
    expect(content().textContent).toContain('06.10.2026');
    expect(content().textContent).toContain("150 000 so'm");
    expect(container.querySelector('article')?.dataset.state).toBe('sold');
    // Faqat oynani yopish: menyu, tahrir, email va sotuv amallari yo'q.
    expect(content().querySelector('[aria-label="Akkount amallari"]')).toBeNull();
    expect(content().querySelector('a')).toBeNull();
    expect(content().querySelectorAll('button')).toHaveLength(2);
    expect(content().textContent).not.toContain('Email biriktirilmagan');
  });

  it('labels a swapped account and leaves out a price it never had', async () => {
    await render({
      status: 'ARCHIVED', archivedReason: 'SWAPPED_ON_PLATFORM', email: null,
      archivedAt: '2026-10-01T09:00:00Z', soldPrice: null,
    });

    expect(content().textContent).toContain('Almashtirilgan');
    expect(content().textContent).toContain('01.10.2026');
    expect(content().textContent).not.toContain("so'm");
  });

  it('offers publishing when the account is idle', async () => {
    await render();
    expect(button('Bozorga chiqarish')).toBeDefined();
    expect(button('Bozordan olish')).toBeUndefined();
  });

  it('sends incomplete accounts to the editor instead of publishing', async () => {
    const onPublish = vi.fn();
    await render({ attributes: {} }, { onPublish });
    expect(content().textContent).toContain("Ma'lumot to'ldirilmagan");
    expect(button('Bozorga chiqarish')).toBeUndefined();
    expect(content().querySelector('a[href="/profile/accounts/acc-1"]')?.textContent).toContain('Ma’lumotlarni to‘ldirish');
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('summarises the account attributes', async () => {
    await render();
    expect(content().textContent).toContain('Mobile');
    expect(content().textContent).toContain('D3');
    expect(content().textContent).toContain('3150');
  });

  it('says so when no email is attached', async () => {
    await render({ email: null, emailSource: null });
    expect(content().textContent).toContain('Email biriktirilmagan');
    expect(content().querySelector<HTMLButtonElement>('[aria-label="Emailni ko‘rsatish"]')).toBeNull();
  });

  it('copies without revealing the email and reports clipboard failures', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await render();
    await act(async () => content().querySelector<HTMLButtonElement>('[aria-label="Emailni nusxalash"]')!.click());
    expect(writeText).toHaveBeenCalledWith('a7f2@efbazaar.uz');
    expect(content().textContent).not.toContain('a7f2@efbazaar.uz');
    expect(content().textContent).toContain('Nusxalandi');
    writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () => content().querySelector<HTMLButtonElement>('[aria-label="Emailni nusxalash"]')!.click());
    expect(content().querySelector('[role="alert"]')?.textContent).toContain('Nusxalab');
  });

  it('requires confirmation before removing a listing, and cancellation changes nothing', async () => {
    await render({ onMarket: true, currentListingId: 'listing-1' });
    await act(async () => content().querySelector<HTMLButtonElement>('[aria-label="Akkount amallari"]')!.click());
    await act(async () => button('Bozordan olish')!.click());
    expect(mocks.unpublishAccount).not.toHaveBeenCalled();
    await act(async () => button('Bekor qilish')!.click());
    expect(mocks.unpublishAccount).not.toHaveBeenCalled();
    await act(async () => content().querySelector<HTMLButtonElement>('[aria-label="Akkount amallari"]')!.click());
    await act(async () => button('Bozordan olish')!.click());
    mocks.unpublishAccount.mockResolvedValueOnce({ ok: true });
    await act(async () => button('Ha, bozordan olish')!.click());
    expect(mocks.unpublishAccount).toHaveBeenCalledWith('acc-1');
  });

  it('uses only supplied owned mailbox links and shows the current price', async () => {
    await render({ onMarket: true }, { display: { mailboxHref: '/mail/owned-1', price: 150000 } });
    expect(content().querySelector('a[href="/mail/owned-1"]')?.textContent).toContain('Pochtani ochish');
    expect(content().textContent?.replace(/\s/g, '')).toContain('150000');
    await render();
    expect(content().textContent).not.toContain('Pochtani ochish');
    expect(content().textContent).toContain('Bozorda emas');
  });

  it('restores focus after an asynchronous unpublish finishes', async () => {
    let finish!: (result: { ok: boolean }) => void;
    mocks.unpublishAccount.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await render({ onMarket: true });
    const trigger = content().querySelector<HTMLButtonElement>('[aria-label="Akkount amallari"]')!;
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
    Array.from(content().querySelectorAll('a')).find((a) => a.textContent?.includes(label));

  it('shows the verified mark and the gold border for a custom address', async () => {
    await render({ email: 'alibek1@efbazaar.uz', emailSource: 'CUSTOM', emailVerified: true });

    expect(content().querySelector('[aria-label="Tasdiqlangan email"]')).toBeTruthy();
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

    expect(content().querySelector('[aria-label="Tasdiqlangan email"]')).toBeTruthy();
    expect(container.querySelector('article')?.className).not.toContain('gold-ring');
  });

  it('offers a custom address when the account has none', async () => {
    await render({ email: null, emailSource: null });

    expect(link('O‘zingiz tanlagan email biriktiring')?.getAttribute('href')).toBe('/mailboxes/custom?accountId=acc-1');
  });

  it('offers verification for the user’s own box', async () => {
    await render({ email: 'sardor10@efbazaar.uz', emailSource: 'MANUAL' }, { display: { verifyMailboxId: 'box-9' } });

    expect(link('Tasdiqlash')?.getAttribute('href')).toBe('/mailboxes/custom/box-9/link?verify=1&accountId=acc-1');
    expect(content().querySelector('[aria-label="Tasdiqlangan email"]')).toBeNull();
  });
});
