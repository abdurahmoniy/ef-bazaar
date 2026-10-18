// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MailboxOwnerPicker } from './mailbox-owner-picker';
import type { User } from '@/lib/types';

const mocks = vi.hoisted(() => ({ searchMailboxUsersAction: vi.fn() }));
vi.mock('@/app/admin/mailboxes/actions', () => ({ searchMailboxUsersAction: mocks.searchMailboxUsersAction }));

const user = (id: string, displayName: string, over: Partial<User> = {}): User => ({
  id, displayName, telegramLinked: true, googleLinked: false, verified: false, roles: ['ROLE_USER'],
  createdAt: '', ...over,
});

let container: HTMLDivElement;
let root: Root;
let picked: string;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  picked = '';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function render(initial: User[]) {
  await act(async () => root.render(createElement(MailboxOwnerPicker, {
    initialUsers: initial,
    value: picked,
    onChange: (id: string) => { picked = id; },
  })));
}

async function type(value: string) {
  const input = container.querySelector('input[type="search"]') as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
}

const options = () => Array.from(container.querySelectorAll('[role="option"]')).map((o) => o.textContent ?? '');

describe('MailboxOwnerPicker', () => {
  it('shows the newest users before anything is typed', async () => {
    await render([user('u1', 'Ali Valiyev'), user('u2', 'Bobur')]);
    expect(options()).toHaveLength(2);
    expect(mocks.searchMailboxUsersAction).not.toHaveBeenCalled();
  });

  it('searches the server by what the admin typed', async () => {
    mocks.searchMailboxUsersAction.mockResolvedValue([{ id: 'u9', displayName: 'Sardor Karimov', telegramUsername: null, email: 'sardor@gmail.com' }]);
    await render([user('u1', 'Ali Valiyev')]);

    await type('sardor@gmail.com');

    expect(mocks.searchMailboxUsersAction).toHaveBeenCalledWith('sardor@gmail.com');
    expect(options()).toEqual([expect.stringContaining('Sardor Karimov')]);
    expect(options()[0]).toContain('sardor@gmail.com');
  });

  it('picks a user from the results', async () => {
    mocks.searchMailboxUsersAction.mockResolvedValue([{ id: 'u9', displayName: 'Sardor Karimov', telegramUsername: 'sardor_k', email: null }]);
    await render([]);
    await type('sardor');

    await act(async () => (container.querySelector('[role="option"]') as HTMLElement).click());
    expect(picked).toBe('u9');
    expect(options()[0]).toContain('@sardor_k');
  });

  it('says so when nobody matches', async () => {
    mocks.searchMailboxUsersAction.mockResolvedValue([]);
    await render([]);
    await type('yoqodam');
    expect(container.textContent).toContain('Hech kim topilmadi');
  });
});
