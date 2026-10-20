// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/accounts-client', () => ({ getMyAccounts: vi.fn() }));
vi.mock('@/lib/mailbox-slots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mailbox-slots')>()),
  fetchSlotStatus: vi.fn(),
  fetchOwnedMailboxes: vi.fn(),
  unlockMailbox: vi.fn(),
}));

import { getMyAccounts } from '@/lib/accounts-client';
import { fetchOwnedMailboxes, fetchSlotStatus, unlockMailbox } from '@/lib/mailbox-slots';
import { MailboxSlotsWarning } from './mailbox-slots-warning';

let container: HTMLDivElement;
let root: Root;

const box = (id: string, locked: boolean, tradeId: string | null = null) => ({
  id, email: `${id}@efbazaar.uz`, tradeId, createdAt: '2026-01-01T00:00:00Z', handedOffAt: null, locked,
});
const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
const inDialog = (label: string) =>
  [...(dialog()?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes(label));

async function render(plan = 'STANDARD') {
  vi.mocked(fetchSlotStatus).mockResolvedValue({ used: 3, limit: 3, totalUsed: 3, totalLimit: 3, customUsed: 0, customLimit: 0, full: true, plan, lockedCount: 1 });
  await act(async () => root.render(createElement(MailboxSlotsWarning)));
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(fetchOwnedMailboxes).mockResolvedValue([
    box('open1', false), box('live1', false, 't1'), box('lock1', true),
  ]);
  vi.mocked(getMyAccounts).mockResolvedValue({ ok: true, data: [] } as never);
  window.history.replaceState(null, '', '/profile');
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('locked mailboxes', () => {
  it('shows a locked card with upgrade + unlock, and never real mail data', async () => {
    await render();
    const section = container.querySelector('#mailboxes')!;
    expect(section).not.toBeNull();
    const card = section.querySelector('article[aria-label="Qulflangan quti lock1@efbazaar.uz"]')!;
    expect(card.textContent).toContain('Qulflangan');
    expect(card.textContent).toContain('Tarifni oshirish');
    expect(card.textContent).toContain('Shuni ochish');
    expect(card.querySelector('[aria-hidden="true"]')!.textContent).toBe('');
  });

  it('hides the upgrade button on the top plan', async () => {
    await render('MAX');
    const card = container.querySelector('article[aria-label^="Qulflangan"]')!;
    expect(card.textContent).not.toContain('Tarifni oshirish');
    expect(card.textContent).toContain('Shuni ochish');
  });

  it('swaps: live-trade box is disabled, picked one is sent', async () => {
    await render();
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent === 'Shuni ochish')!.click();
    });
    const radios = [...dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((r) => [r.value, r.disabled])).toEqual([['open1', false], ['live1', true]]);
    expect(dialog()!.textContent).toContain('Davom etayotgan savdoda');
    expect(inDialog('Almashtirish')!.hasAttribute('disabled')).toBe(true);

    await act(async () => radios[0].click());
    await act(async () => inDialog('Almashtirish')!.click());
    expect(unlockMailbox).toHaveBeenCalledWith('lock1', 'open1');
    expect(dialog()).toBeNull();
  });

  it('shows the backend message on a rejected swap and stays open', async () => {
    vi.mocked(unlockMailbox).mockRejectedValue(new Error('Bu qutini qulflab bo‘lmaydi'));
    await render();
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent === 'Shuni ochish')!.click();
    });
    await act(async () => dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')[0].click());
    await act(async () => inDialog('Almashtirish')!.click());
    expect(dialog()!.querySelector('[role="alert"]')!.textContent).toContain('Bu qutini qulflab bo‘lmaydi');
  });

  it('does not close while the request is in flight', async () => {
    let finish!: () => void;
    vi.mocked(unlockMailbox).mockReturnValue(new Promise<void>((r) => { finish = r; }));
    await render();
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent === 'Shuni ochish')!.click();
    });
    await act(async () => dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')[0].click());
    await act(async () => inDialog('Almashtirish')!.click());
    await act(async () => {
      dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dialog()).not.toBeNull();
    expect(inDialog('Bekor qilish')!.hasAttribute('disabled')).toBe(true);
    await act(async () => finish());
    expect(dialog()).toBeNull();
  });

  it('Escape closes an idle dialog', async () => {
    await render();
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent === 'Shuni ochish')!.click();
    });
    expect(dialog()).not.toBeNull();
    await act(async () => {
      dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dialog()).toBeNull();
  });

  it('?mailbox=<locked id> opens its swap dialog on load', async () => {
    window.history.replaceState(null, '', '/profile?mailbox=lock1');
    await render();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain('lock1@efbazaar.uz ni ochish');
  });

  it('?mailbox=<open id> does not open anything', async () => {
    window.history.replaceState(null, '', '/profile?mailbox=open1');
    await render();
    expect(dialog()).toBeNull();
  });

  it('meter never exceeds its max when used > limit', async () => {
    vi.mocked(fetchSlotStatus).mockResolvedValue({ used: 5, limit: 3, totalUsed: 5, totalLimit: 3, customUsed: 0, customLimit: 0, full: true, plan: 'STANDARD', lockedCount: 1 });
    await act(async () => root.render(createElement(MailboxSlotsWarning)));
    const m = container.querySelector('[role="meter"]')!;
    expect(Number(m.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(Number(m.getAttribute('aria-valuemax')));
    expect(m.children).toHaveLength(4);
  });

  it('reason text of a disabled candidate is not dimmed by opacity', async () => {
    await render();
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent === 'Shuni ochish')!.click();
    });
    const label = dialog()!.querySelectorAll('label')[1];
    expect(label.className).not.toMatch(/opacity/);
  });
});

 it('allows a Free custom inbox to replace an open random inbox and the reverse', async () => {
   vi.mocked(fetchOwnedMailboxes).mockResolvedValue([
     { ...box('custom-open', false), kind: 'CUSTOM' }, box('random-open', false),
     { ...box('custom-locked', true), kind: 'CUSTOM' }, box('random-locked', true),
   ]);
   await render();
   expect(container.textContent).toContain('custom-open@efbazaar.uz');
   expect(container.querySelector('button[aria-label="custom-open@efbazaar.uz pochta qutisini o‘zimdan uzish"]')).toBeNull();
   const customButton = container.querySelector('article[aria-label="Qulflangan quti custom-locked@efbazaar.uz"] button:last-child') as HTMLButtonElement;
   const randomButton = container.querySelector('article[aria-label="Qulflangan quti random-locked@efbazaar.uz"] button:last-child') as HTMLButtonElement;
   await act(async () => customButton.click());
   await act(async () => dialog()!.querySelector<HTMLInputElement>('input[value="random-open"]')!.click());
   await act(async () => inDialog('Almashtirish')!.click());
   expect(unlockMailbox).toHaveBeenCalledWith('custom-locked', 'random-open');
   await act(async () => randomButton.click());
   await act(async () => dialog()!.querySelector<HTMLInputElement>('input[value="custom-open"]')!.click());
   await act(async () => inDialog('Almashtirish')!.click());
   expect(unlockMailbox).toHaveBeenCalledWith('random-locked', 'custom-open');
 });

 it('explains retained allocation and labels custom admin gifts outside the quota', async () => {
   vi.mocked(fetchOwnedMailboxes).mockResolvedValue([
     { ...box('gift-custom', false), kind: 'CUSTOM', slotExempt: true }, box('lock1', true),
   ]);
   await render();
   expect(container.querySelector('li')?.textContent).toContain('Umumiy limitdan tashqarida');
   expect(container.textContent).toContain('Qutini o‘zingizdan uzish jami ajratilgan joyni kamaytirmaydi');
   expect(container.textContent).toContain('Custom chegarasi yangi nomli quti yaratish uchun');
   expect(container.textContent).toContain('O‘qiladigan qutini tanlash uchun ochiq quti bilan almashtiring');
   expect(container.textContent).not.toContain('ular avtomatik ochiladi');
 });

it('lets a grace inbox join the Free selection before recovery starts', async () => {
  vi.mocked(fetchOwnedMailboxes).mockResolvedValue([
    { ...box('selected', false), accessState: 'ACTIVE', selectedForFree: true },
    { ...box('grace', false), accessState: 'GRACE', selectedForFree: false, paidExpiresAt: '2026-10-01T00:00:00Z', graceEndsAt: '2026-10-31T00:00:00Z' },
  ]);
  await render();
  const choose = [...container.querySelectorAll('button')].find(b => b.textContent === 'Free uchun tanlash');
  expect(choose).toBeDefined();
  await act(async () => choose!.click());
  expect(dialog()?.textContent).toContain('grace@efbazaar.uz');
  expect([...dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map(r => r.value)).toEqual(['selected']);
});
