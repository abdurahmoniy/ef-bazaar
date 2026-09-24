// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MailboxUnlink } from './mailbox-unlink';

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));
const fetchMock = vi.fn();
let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  vi.clearAllMocks();
  // jsdom does not implement the browser's modal top layer.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(MailboxUnlink, {
    mailboxId: 'mailbox-1', email: 'account@efbazaar.uz',
  })));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const typeConfirmation = async (value: string) => act(async () => {
  const field = container.querySelector<HTMLInputElement>('input[type="email"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
});

const confirmButton = () =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Ha, uzish'))!;

async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;
  expect(button).toBeDefined();
  await act(async () => button.click());
}

it('asks before unlinking, identifies the address, and cancels without a request', async () => {
  await click('Hisobimdan uzish');
  expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain('account@efbazaar.uz');
  expect(fetchMock).not.toHaveBeenCalled();
  await click('Bekor');
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(document.activeElement?.textContent).toContain('Hisobimdan uzish');
});

it('unlinks only after confirmation and leaves the removed inbox', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await click('Hisobimdan uzish');
  await typeConfirmation('account@efbazaar.uz');
  await click('Ha, uzish');
  expect(fetchMock).toHaveBeenCalledWith('/api/trade/v1/mailboxes/mailbox-1/detach',
    expect.objectContaining({ method: 'POST' }));
  expect(replace).toHaveBeenCalledWith('/');
  expect(refresh).toHaveBeenCalledOnce();
});

it('shows server errors without leaving the inbox and permits retry', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Savdo davom etmoqda' }), { status: 409 }));
  await click('Hisobimdan uzish');
  await typeConfirmation('account@efbazaar.uz');
  await click('Ha, uzish');
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Savdo davom etmoqda');
  expect(replace).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await click('Ha, uzish');
  expect(replace).toHaveBeenCalledWith('/');
});

it('handles network failure without navigating', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Network error'));
  await click('Hisobimdan uzish');
  await typeConfirmation('account@efbazaar.uz');
  await click('Ha, uzish');
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(replace).not.toHaveBeenCalled();
});

it('disables confirmation and cancellation while the request is pending', async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
  await click('Hisobimdan uzish');
  await typeConfirmation('account@efbazaar.uz');
  await click('Ha, uzish');
  expect([...container.querySelectorAll('[role="alertdialog"] button')]
    .every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  expect(fetchMock).toHaveBeenCalledOnce();
  await act(async () => finish(new Response(null, { status: 204 })));
});

it('opens a native modal outside the header flow and restores scroll on Escape', async () => {
  await click('Hisobimdan uzish');
  const dialog = container.querySelector('dialog')!;
  expect(dialog).not.toBeNull();
  expect(dialog.open).toBe(true);
  expect(dialog.showModal).toHaveBeenCalledOnce();
  expect(document.body.style.overflow).toBe('hidden');
  expect(document.activeElement?.textContent).toContain('Bekor');
  await act(async () => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
  expect(container.querySelector('dialog')).toBeNull();
  expect(document.body.style.overflow).toBe('');
  expect(document.activeElement?.textContent).toContain('Hisobimdan uzish');
  expect(fetchMock).not.toHaveBeenCalled();
});

// Tasdiq manzilni TERISH bilan: "Ha" ni o'ylamasdan bosish mumkin, manzilni
// terish esa nimadan voz kechayotganini ko'rsatadi. Uzilgan qutiga qayta
// kirishni foydalanuvchining o'zi tiklay olmaydi.

it('manzil terilmaguncha uzmaydi', async () => {
  await click('Hisobimdan uzish');
  expect(confirmButton().disabled).toBe(true);

  await typeConfirmation('account@efbazaar');
  expect(confirmButton().disabled).toBe(true);

  await typeConfirmation('account@efbazaar.uz');
  expect(confirmButton().disabled).toBe(false);
});

it('registr va chetdagi bo‘shliq to‘siq bo‘lmaydi', async () => {
  // Telefonda birinchi harf o'zi kattalashadi, nusxa olishda bo'shliq
  // yopishadi. Bu odamni to'g'ri qarorida to'xtatmasligi kerak.
  await click('Hisobimdan uzish');
  await typeConfirmation('  Account@EFBazaar.UZ  ');
  expect(confirmButton().disabled).toBe(false);
});

it('Konami ID haqida ogohlantiradi', async () => {
  await click('Hisobimdan uzish');
  expect(container.querySelector('[role="alertdialog"]')!.textContent).toContain('KONAMI ID');
});

it('bekor qilingach terilgan matn saqlanib qolmaydi', async () => {
  await click('Hisobimdan uzish');
  await typeConfirmation('account@efbazaar.uz');
  await click('Bekor');
  await click('Hisobimdan uzish');

  expect(container.querySelector<HTMLInputElement>('input[type="email"]')!.value).toBe('');
  expect(confirmButton().disabled).toBe(true);
});
