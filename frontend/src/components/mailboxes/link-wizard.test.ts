// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LinkWizard } from './link-wizard';
import type { UserAccountResponse } from '@/lib/accounts-types';
import type { LinkSession } from '@/lib/link-session';

const mocks = vi.hoisted(() => ({
  openSession: vi.fn(),
  getSession: vi.fn(),
  markEmailChanged: vi.fn(),
  retrySession: vi.fn(),
  cancelSession: vi.fn(),
  republishSession: vi.fn(),
  getMyAccounts: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));
vi.mock('@/lib/custom-mailbox-client', () => ({
  openSession: mocks.openSession,
  getSession: mocks.getSession,
  markEmailChanged: mocks.markEmailChanged,
  retrySession: mocks.retrySession,
  cancelSession: mocks.cancelSession,
  republishSession: mocks.republishSession,
  MailboxApiError: class extends Error {},
}));
vi.mock('@/lib/accounts-client', () => ({ getMyAccounts: mocks.getMyAccounts }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const EMAIL = 'alibek1@efbazaar.uz';

const account = (id: string, over: Partial<UserAccountResponse> = {}): UserAccountResponse => ({
  id, title: `Akkount ${id}`, description: '', attributes: {}, mediaMessageIds: [],
  email: null, emailSource: null, emailVerified: false, status: 'ACTIVE', onMarket: false,
  currentListingId: null, createdAt: '', updatedAt: '', ...over,
});

const session = (state: LinkSession['state'], over: Partial<LinkSession> = {}): LinkSession => ({
  id: 's1', mailboxId: 'box-1', email: EMAIL, accountId: 'a1', state,
  stepDeadline: new Date(Date.now() + 15 * 60_000).toISOString(), emailChangeCode: null, notRegistered: false, ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  // Every client call answers with a promise unless a test says otherwise.
  mocks.getSession.mockResolvedValue(session('WAIT_RESET'));
  mocks.cancelSession.mockResolvedValue(undefined);
  mocks.republishSession.mockResolvedValue(undefined);
  mocks.getMyAccounts.mockResolvedValue({ ok: true, data: [] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function render(props: Partial<Parameters<typeof LinkWizard>[0]> = {}) {
  await act(async () => root.render(createElement(LinkWizard, {
    mailboxId: 'box-1',
    email: EMAIL,
    accounts: [
      account('a3', { email: 'trade-1@efbazaar.uz', emailSource: 'PLATFORM', emailVerified: true }),
      account('a1'),
      account('a2', { email: 'old12@efbazaar.uz', emailSource: 'CUSTOM', emailVerified: true }),
    ],
    initialAccountId: null,
    initialSessionId: null,
    verify: false,
    ...props,
  })));
}

const text = () => container.textContent ?? '';
const button = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label));
const tick = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('LinkWizard', () => {
  it('lists accounts without email first and leaves out ones already on a custom box', async () => {
    await render();
    const radios = Array.from(container.querySelectorAll('[role="radio"]')).map((r) => r.textContent ?? '');
    expect(radios[0]).toContain('Akkount a1');
    expect(radios.some((r) => r.includes('Akkount a2'))).toBe(false);
    const other = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('Boshqa'));
    expect(other?.getAttribute('href')).toBe('/profile/accounts/new?returnTo=%2Fmailboxes%2Fcustom%2Fbox-1%2Flink');
  });

  it('opens a session for the picked account and shows the relayed code', async () => {
    mocks.openSession.mockResolvedValue(session('WAIT_EMAIL_CHANGE'));
    mocks.getSession.mockResolvedValue(session('WAIT_EMAIL_CHANGE', { emailChangeCode: '482913' }));
    await render();

    await act(async () => (container.querySelector('[role="radio"]') as HTMLButtonElement).click());
    await act(async () => button('Davom etish')!.click());
    expect(mocks.openSession).toHaveBeenCalledWith('box-1', 'a1', false);
    expect(text()).toContain('Konami emailini almashtiring');

    await tick(3100);
    expect(text()).toContain('482913');
  });

  it('moves to forgot-password and finishes when the mail lands', async () => {
    mocks.openSession.mockResolvedValue(session('WAIT_EMAIL_CHANGE'));
    mocks.markEmailChanged.mockResolvedValue(session('WAIT_RESET'));
    mocks.getSession.mockResolvedValue(session('VERIFIED'));
    mocks.getMyAccounts.mockResolvedValue({ ok: true, data: [account('a1', { email: EMAIL, emailVerified: true })] });
    await render({ initialAccountId: 'a1' });
    await act(async () => button('Davom etish')!.click());

    await act(async () => button('Emailni o‘zgartirdim')!.click());
    expect(text()).toContain('parolni o‘zgartirish shart emas');

    await tick(3100);
    expect(text()).toContain('Muvaffaqiyatli ulandi');
    expect(button('Qayta sinxronlash')).toBeUndefined();
  });

  it('offers a resync when the account did not get the email', async () => {
    mocks.getSession.mockResolvedValue(session('VERIFIED'));
    mocks.getMyAccounts.mockResolvedValue({ ok: true, data: [account('a1')] });
    await render({ initialSessionId: 's1' });
    await tick(0);
    await tick(6000);

    await act(async () => button('Qayta sinxronlash')!.click());
    expect(mocks.republishSession).toHaveBeenCalledWith('s1');
  });

  it('verifying an address the account already has skips the email change', async () => {
    mocks.openSession.mockResolvedValue(session('WAIT_RESET'));
    await render({ initialAccountId: 'a3', verify: true });

    await act(async () => button('Tasdiqlashni boshlash')!.click());
    expect(mocks.openSession).toHaveBeenCalledWith('box-1', 'a3', true);
    expect(text()).toContain('Endi Forgot password qiling');
  });

  it('retries an expired step', async () => {
    mocks.getSession.mockResolvedValue(session('EXPIRED'));
    mocks.retrySession.mockResolvedValue(session('WAIT_RESET'));
    await render({ initialSessionId: 's1' });
    await tick(0);
    expect(text()).toContain('Vaqt tugadi');

    await act(async () => button('Qayta urinish')!.click());
    expect(mocks.retrySession).toHaveBeenCalledWith('s1');
    expect(text()).toContain('Endi Forgot password qiling');
  });

  it('warns when Konami says the email has not moved yet', async () => {
    mocks.getSession.mockResolvedValue(session('WAIT_EMAIL_CHANGE', { notRegistered: true }));
    await render({ initialSessionId: 's1' });
    await tick(0);
    expect(text()).toContain('Email hali o‘zgarmagan');
  });
});
