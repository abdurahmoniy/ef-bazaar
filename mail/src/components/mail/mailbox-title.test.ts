// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailboxTitle } from './mailbox-title';
import type { MailboxSummary } from '@/lib/mail-types';

const { refresh, save } = vi.hoisted(() => ({ refresh: vi.fn(), save: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/lib/mailbox-name', () => ({ MAILBOX_NAME_MAX_LENGTH: 60, saveMailboxName: save }));

const mailbox: MailboxSummary = {
  id: 'mailbox-1', email: 'account@efbazaar.uz', displayName: 'Main account',
  unreadCount: 2, lastActivityAt: null, ownedSince: '2026-09-19T00:00:00Z',
};
let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  save.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(MailboxTitle, { mailbox })));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function editButton() {
  return container.querySelector<HTMLButtonElement>('button[aria-label="Pochta nomini o‘zgartirish"]')!;
}
async function edit(value: string) {
  await act(async () => editButton().click());
  const input = container.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}
async function submit() {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('MailboxTitle', () => {
  it('shows the custom name and retains the address and copy action', () => {
    expect(container.querySelector('h1')?.textContent).toBe('Main account');
    expect(container.textContent).toContain(mailbox.email);
    expect(container.querySelector('button[aria-label="Pochta manzilini nusxalash"]')).not.toBeNull();
  });

  it('saves the edited draft and refreshes server-rendered mailbox names', async () => {
    await edit('Barcelona squad');
    await submit();
    expect(save).toHaveBeenCalledWith(mailbox.id, 'Barcelona squad');
    expect(refresh).toHaveBeenCalledOnce();
    expect(container.querySelector('form')).toBeNull();
    expect(document.activeElement).toBe(editButton());
  });

  it('retains the draft and shows an error when saving fails', async () => {
    save.mockRejectedValueOnce(new Error('Pochta nomi saqlanmadi.'));
    await edit('Barcelona squad');
    await submit();
    expect(container.querySelector('input')?.value).toBe('Barcelona squad');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('saqlanmadi');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('focuses the input and cancels with Escape without saving', async () => {
    const input = await edit('Discard this');
    expect(document.activeElement).toBe(input);
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(save).not.toHaveBeenCalled();
    expect(container.querySelector('h1')?.textContent).toBe('Main account');
    expect(document.activeElement).toBe(editButton());
  });

  it('submits an empty draft to remove the name', async () => {
    await edit('');
    await submit();
    expect(save).toHaveBeenCalledWith(mailbox.id, '');
  });

  it('prevents repeated submissions while a save is pending', async () => {
    let finish!: () => void;
    save.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    await edit('New name');
    await submit();
    expect(container.querySelector('input')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await submit();
    expect(save).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(refresh).toHaveBeenCalledOnce();
  });
});
