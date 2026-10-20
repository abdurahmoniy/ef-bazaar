// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { MailboxDataTools } from './mailbox-data-tools';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
let container: HTMLDivElement; let root: Root; const fetchMock = vi.fn();
const messages = [{ messageId: '1', subject: 'ordinary', criticalRecovery: false }, { messageId: '2', subject: 'Konami recovery', criticalRecovery: true }];
beforeEach(async () => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', fetchMock); vi.stubGlobal('confirm', vi.fn().mockReturnValue(false)); container = document.createElement('div'); document.body.append(container); root = createRoot(container); await act(async () => root.render(createElement(MailboxDataTools, { mailboxId: 'box', messages: messages as never }))); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const click = async (text: string) => act(async () => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text))!.click());
it('protects critical messages and requires explicit irreversible cleanup confirmation', async () => {
  expect(container.querySelector<HTMLInputElement>('input[value="2"]')?.disabled).toBe(true);
  await act(async () => container.querySelector<HTMLInputElement>('input[value="1"]')!.click());
  await click('Tanlangan xatlarni o‘chirish');
  expect(fetchMock).not.toHaveBeenCalled();
  vi.mocked(confirm).mockReturnValue(true); fetchMock.mockResolvedValue(Response.json({ deleted: 1 }));
  await click('Tanlangan xatlarni o‘chirish');
  expect(fetchMock).toHaveBeenCalledWith('/api/trade/v1/mail/box/cleanup', expect.objectContaining({ method: 'POST', body: JSON.stringify({ messageIds: ['1'], confirmDelete: true }) }));
});
it('does not request a private export when the user cancels', async () => {
  await click('Eksport'); expect(fetchMock).not.toHaveBeenCalled();
});
it('shows backend cleanup hold errors and retains selection for retry', async () => {
  vi.mocked(confirm).mockReturnValue(true); fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'legal_hold' }), { status: 409 }));
  await act(async () => container.querySelector<HTMLInputElement>('input[value="1"]')!.click());
  await click('Tanlangan xatlarni o‘chirish');
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('legal_hold');
  expect(container.querySelector<HTMLInputElement>('input[value="1"]')?.checked).toBe(true);
});

it('exports bounded ZIP parts and passes the server cursor for the next part', async () => {
  vi.mocked(confirm).mockReturnValue(true);
  const create = vi.fn().mockReturnValue('blob:fixture');
  Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  fetchMock.mockResolvedValueOnce(new Response('zip fixture', { headers: { 'Content-Type': 'application/zip', 'X-Next-Before-Uid': '105' } })).mockResolvedValueOnce(new Response('zip last', { headers: { 'Content-Type': 'application/zip' } }));
  await click('Eksport — ZIP');
  expect(fetchMock).toHaveBeenLastCalledWith('/api/trade/v1/mail/box/export?limit=100', expect.anything());
  await click('Eksport — keyingi');
  expect(fetchMock).toHaveBeenLastCalledWith('/api/trade/v1/mail/box/export?limit=100&beforeUid=105', expect.anything());
  expect(container.textContent).toContain('Eksport tugadi');
  vi.restoreAllMocks();
});
