// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getMe: vi.fn(), refresh: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }), notFound: () => { throw new Error('not found'); }, redirect: (href: string) => { throw new Error(href); } }));
vi.mock('@/lib/auth', () => ({ getMe: mocks.getMe }));
vi.mock('@/lib/mail-server', () => ({ getMyMailboxes: async () => [{ id: 'box' }], getMailboxSlots: async () => null }));
vi.mock('@/components/mail/mail-shell', () => ({ MailShell: ({ children }: { children: ReactNode }) => createElement('main', null, children) }));
import Layout from '@/app/[mailboxId]/layout';
import { MailboxDataTools } from './mailbox-data-tools';
let identity: string;
let host: HTMLDivElement;
let root: Root;
const fetcher = vi.fn();
beforeEach(() => {
  identity = 'A'; mocks.getMe.mockImplementation(async () => ({ id: identity }));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', fetcher); vi.stubGlobal('confirm', vi.fn(() => true));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function render() {
  const element = await Layout({ params: Promise.resolve({ mailboxId: 'box' }), children: createElement(MailboxDataTools, { mailboxId: 'box', messages: [{ messageId: '1', subject: 'ordinary', criticalRecovery: false }] as never }) });
  await act(async () => root.render(element));
}
async function click(text: string) { await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent?.includes(text))!.click()); }
it('does not download old private mail when its export finishes after navigating away', async () => {
  let finish!: (response: Response) => void;
  fetcher.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const download = vi.fn(); Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: download }); Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await render(); await click('Eksport — ZIP');
  await act(async () => root.render(null));
  await act(async () => finish(new Response('A private mail', { headers: { 'Content-Type': 'application/zip' } })));
  expect(download).not.toHaveBeenCalled();
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
});
it('clears private selection and aborts a pending cleanup if a transferred mailbox opens under a new principal', async () => {
  let finish!: (response: Response) => void;
  fetcher.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render();
  await act(async () => host.querySelector<HTMLInputElement>('input[value="1"]')!.click());
  await render(); expect(host.querySelector<HTMLInputElement>('input[value="1"]')!.checked).toBe(true);
  await click('Tanlangan xatlarni o‘chirish');
  identity = 'B'; await render();
  expect(host.querySelector<HTMLInputElement>('input[value="1"]')!.checked).toBe(false);
  await act(async () => finish(Response.json({ deleted: 1 })));
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
});
