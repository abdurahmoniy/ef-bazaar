// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/accounts-client', () => ({ getMyAccounts: vi.fn() }));
vi.mock('@/lib/mailbox-slots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mailbox-slots')>()),
  fetchSlotStatus: vi.fn(),
  fetchOwnedMailboxes: vi.fn(),
  detachMailbox: vi.fn(),
}));

import { getMyAccounts } from '@/lib/accounts-client';
import { fetchOwnedMailboxes, fetchSlotStatus } from '@/lib/mailbox-slots';
import { MailboxSlotsWarning } from './mailbox-slots-warning';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(fetchSlotStatus).mockResolvedValue({ used: 2, limit: 3, totalUsed: 2, totalLimit: 3, customUsed: 0, customLimit: 0, full: false, plan: 'STANDARD', lockedCount: 0 });
  vi.mocked(fetchOwnedMailboxes).mockResolvedValue([
    { id: 'm1', email: 'bound@efbazaar.uz', tradeId: null, createdAt: '2026-09-01T00:00:00Z', handedOffAt: null, locked: false },
    { id: 'm2', email: 'free@efbazaar.uz', tradeId: null, createdAt: '2026-09-02T00:00:00Z', handedOffAt: null, locked: false },
  ]);
  vi.mocked(getMyAccounts).mockResolvedValue({
    ok: true,
    data: [{ email: 'bound@efbazaar.uz' }],
  } as never);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

const render = async () => act(async () => root.render(createElement(MailboxSlotsWarning)));
const openList = async () => {
  const button = Array.from(container.querySelectorAll('button'))
    .find((b) => b.textContent?.includes('qutilarimni'))!;
  await act(async () => button.click());
};

describe('MailboxSlotsWarning', () => {
  it('to‘lishidan oldin ham ko‘rinadi', async () => {
    // Slot to'lganda savdo allaqachon rad etilgan bo'ladi — ogohlantirish
    // undan oldin kelmasa, u hech narsani o'zgartirmaydi.
    await render();
    expect(container.textContent).toContain('1 ta qoldi');
  });

  it('bog‘lanmagan qutini belgilab, tepaga chiqaradi', async () => {
    await render();
    await openList();

    const rows = Array.from(container.querySelectorAll('li'));
    expect(rows[0].textContent).toContain('free@efbazaar.uz');
    expect(rows[0].textContent).toContain('bog‘lanmagan');
    expect(rows[0].textContent).not.toContain('o‘chirish xavfsiz');
    expect(rows[0].textContent).toContain('uzilgach kirish yo‘qoladi, quti saqlanadi');
    expect(rows[1].textContent).toContain('bog‘langan');
  });

  it('akkountlar o‘qilmasa hech narsani "o‘chirish xavfsiz" demaydi', async () => {
    // Bilmaslik "bo'sh" degani emas: noto'g'ri belgi odamni akkounti
    // tiklanadigan yagona pochtani o'chirishga undardi.
    vi.mocked(getMyAccounts).mockResolvedValue({ ok: false, error: 'xato' } as never);
    await render();
    await openList();

    expect(container.textContent).not.toContain('bog‘lanmagan');
  });

  it('shows total and custom usage even while there is room', async () => {
    vi.mocked(fetchSlotStatus).mockResolvedValue({ used: 1, limit: 3, totalUsed: 1, totalLimit: 3, customUsed: 0, customLimit: 0, full: false, plan: 'STANDARD', lockedCount: 0 });
    await render();
    expect(container.textContent).toContain('Jami: 1 / 3');
    expect(container.textContent).toContain('shundan custom: 0 / 0');
    expect(container.textContent).not.toContain('to‘lay');
  });
});
