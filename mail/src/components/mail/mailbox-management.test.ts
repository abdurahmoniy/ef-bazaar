// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), unlock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/components/mail/mailbox-unlink', () => ({ MailboxUnlink: ({ mailboxId }: { mailboxId: string }) => createElement('button', { 'data-detach-id': mailboxId }, 'Hisobimdan uzish') }));
vi.mock('@/components/mail/mailbox-resources', () => ({ MailboxResources: () => createElement('div', null, 'Resource management') }));
vi.mock('@/lib/mailbox-management', async original => ({ ...(await original<typeof import('@/lib/mailbox-management')>()), unlockMailbox: mocks.unlock }));
import { MailboxManagement } from './mailbox-management';
import type { OwnedMailbox } from '@/lib/mailbox-management';
const slots = { used: 6, limit: 13, totalUsed: 6, totalLimit: 13, customUsed: 0, customLimit: 3, exemptUsed: 2, resourceUsed: 8, lockedCount: 0, full: false, plan: 'PRO' };
const boxes: OwnedMailbox[] = [
 { id: 'open', email: 'open@efbazaar.uz', locked: false, tradeId: null, provisionedAt: '2026-01-01', accessState: 'ACTIVE' },
 { id: 'locked', email: 'locked@efbazaar.uz', locked: true, tradeId: null, accessState: 'RECOVERY' },
 { id: 'gift', email: 'gift@efbazaar.uz', locked: false, tradeId: null, slotExempt: true },
 { id: 'trade', email: 'trade@efbazaar.uz', locked: false, tradeId: 'active', activeTrade: true },
];
let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); mocks.unlock.mockResolvedValue(undefined); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const render = async (extra = {}) => act(async () => root.render(createElement(MailboxManagement, { boxes, slots, accountEmails: [], ...extra })));
const click = async (text: string) => act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text))!.click());
it('shows neutral quota details and unused boxes without an alert banner', async () => {
 await render();
 expect(host.textContent).toContain('6 / 13'); expect(host.textContent).toContain('Custom: 0 / 3');
 expect(host.textContent).toContain('Limitdan tashqari: 2'); expect(host.textContent).toContain('Resursda: 8');
 expect(host.querySelector('[role="alert"]')).toBeNull();
 const section = host.querySelector('[aria-label="Akkountga ulanmagan qutilar"]');
 expect(section?.textContent).toContain('open@efbazaar.uz');
 expect(section?.querySelector('a')?.getAttribute('href')).toContain('/mailboxes/custom/open/link');
 expect(host.textContent).toContain('Resource management');
});
it('does not infer unused or zero mailboxes from unavailable data', async () => {
 await render({ boxes: null, slots: null, accountEmails: null });
 expect(host.textContent).toContain('Qutilar ro‘yxati yuklanmadi'); expect(host.textContent).toContain('Pochta limiti aniqlanmadi');
 expect(host.querySelector('[aria-label="Akkountga ulanmagan qutilar"]')).toBeNull();
 expect(host.textContent).not.toContain('0 /');
 await click('Qayta yuklash'); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it('keeps linkage unknown when account data fails', async () => {
 await render({ accountEmails: null });
 expect(host.textContent).toContain('Akkountlarga bog‘lanish aniqlanmadi');
 expect(host.querySelector('[aria-label="Akkountga ulanmagan qutilar"]')).toBeNull();
});
it('requires explicit selection and keeps gifts or active trades out of swaps', async () => {
 await render({ wantedMailboxId: 'locked' });
 const form = host.querySelector('form')!;
 expect(form).not.toBeNull();
 expect(form.querySelector<HTMLInputElement>('input[value="gift"]')!.disabled).toBe(true);
 expect(form.querySelector<HTMLInputElement>('input[value="trade"]')!.disabled).toBe(true);
 const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
 expect(submit.disabled).toBe(true); expect(mocks.unlock).not.toHaveBeenCalled();
 await act(async () => form.querySelector<HTMLInputElement>('input[value="open"]')!.click());
 await act(async () => submit.click());
 expect(mocks.unlock).toHaveBeenCalledWith('locked', 'open', expect.any(AbortSignal));
 expect(mocks.refresh).toHaveBeenCalledOnce();
});
it('preserves selection and backend errors for a failed swap', async () => {
 mocks.unlock.mockRejectedValue(new Error('Savdodagi quti himoyalangan'));
 await render({ wantedMailboxId: 'locked' });
 const form = host.querySelector('form')!;
 await act(async () => form.querySelector<HTMLInputElement>('input[value="open"]')!.click());
 await act(async () => form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
 expect(host.querySelector('[role="alert"]')?.textContent).toContain('Savdodagi quti himoyalangan');
 expect(form.querySelector<HTMLInputElement>('input[value="open"]')!.checked).toBe(true);
 expect(mocks.refresh).not.toHaveBeenCalled();
});
it('shows quota pressure only when capacity needs attention and hides staff counts', async () => {
 await render({ slots: { ...slots, totalUsed: 13, full: true } });
 expect(host.textContent).toContain('Pochta limiti to‘lgan');
 await render({ slots: { ...slots, plan: 'STAFF', totalLimit: null } });
 expect(host.textContent).not.toContain('Custom:'); expect(host.textContent).not.toContain('Pochta limiti to‘lgan');
});
it('blocks repeated access swaps while pending and aborts a stale private action on unmount', async () => {
 let complete!: () => void;
 mocks.unlock.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
 await render({ wantedMailboxId: 'locked' });
 const form = host.querySelector('form')!;
 await act(async () => form.querySelector<HTMLInputElement>('input[value="open"]')!.click());
 await act(async () => {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
 });
 expect(mocks.unlock).toHaveBeenCalledOnce();
 const signal = mocks.unlock.mock.calls[0][2] as AbortSignal;
 expect(form.getAttribute('aria-busy')).toBe('true');
 expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
 await act(async () => root.render(null));
 expect(signal.aborted).toBe(true);
 await act(async () => complete());
 expect(mocks.refresh).not.toHaveBeenCalled();
});

it('preserves detach for legacy locked random boxes while protecting custom and active trade boxes', async () => {
 await render({ boxes: [
  { id: 'legacy', email: 'legacy@efbazaar.uz', tradeId: null, kind: 'RANDOM', locked: true },
  { id: 'custom', email: 'custom@efbazaar.uz', tradeId: null, kind: 'CUSTOM', locked: false },
  { id: 'trading', email: 'trading@efbazaar.uz', tradeId: null, kind: 'RANDOM', activeTrade: true, locked: false },
  { id: 'history', email: 'history@efbazaar.uz', tradeId: 'trade', kind: 'RANDOM', locked: false },
 ] });
 expect([...host.querySelectorAll('[data-detach-id]')].map(node => node.getAttribute('data-detach-id'))).toEqual(['legacy']);
});
