// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const nav = vi.hoisted(() => ({ path: '/marketplace', push: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path, useRouter: () => ({ push: nav.push }) }));
vi.mock('@/lib/popups/client', () => ({ nextPopup: vi.fn(), claimPopup: vi.fn(), recordPopupEvent: vi.fn().mockResolvedValue(undefined) }));
import { nextPopup, claimPopup, recordPopupEvent } from '@/lib/popups/client';
import { PopupHost } from './popup-host';
import { clearPopupTrigger } from '@/lib/popups/triggers';
const campaign = { id: 'campaign', title: 'Yangi imkoniyat', message: 'Do‘stlaringiz bilan bo‘lishing.', tone: 'INFO' as const, trigger: 'BROWSE' as const, actionLabel: 'Taklif qilish', actionPath: '/invite', endsAt: '2099-01-01T00:00:00Z' };
let root: Root; let container: HTMLDivElement;
beforeEach(() => {
  clearPopupTrigger(); window.history.replaceState(null, '', '/');
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.clear(); sessionStorage.clear(); nav.path = '/marketplace';
  vi.mocked(nextPopup).mockResolvedValue(campaign); vi.mocked(claimPopup).mockResolvedValue({ deliveryId: 'delivery', campaign });
  container=document.createElement('div'); document.body.append(container); root=createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function render(userId: string | null = 'user') { await act(async () => root.render(createElement(PopupHost, { userId }))); }
async function wait(ms = 16_000) { await act(async () => vi.advanceTimersByTimeAsync(ms)); }
it('waits for dwell and idle, claims before showing, records the actual display and remembers dismissal', async () => {
  await render(); await wait(10_000); expect(nextPopup).not.toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new Event('pointerdown'))); await wait(2_000); expect(nextPopup).not.toHaveBeenCalled();
  await wait(4_000); expect(document.querySelector('[role="dialog"]')?.textContent).toContain(campaign.title);
  expect(claimPopup).toHaveBeenCalledWith('campaign', 'BROWSE', expect.any(String), expect.any(AbortSignal));
  expect(recordPopupEvent).toHaveBeenCalledWith('delivery', 'SHOWN');
  await act(async () => (document.querySelector('[data-popup-dismiss]') as HTMLButtonElement).click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(recordPopupEvent).toHaveBeenCalledWith('delivery', 'DISMISSED');
  await wait(120_000); expect(claimPopup).toHaveBeenCalledOnce();
});
it('never fetches for guests or a sensitive route', async () => {
  await render(null); await wait(); expect(nextPopup).not.toHaveBeenCalled();
  nav.path='/wallet'; await render(); await wait(); expect(nextPopup).not.toHaveBeenCalled();
});
it('waits until typing and other dialogs have ended', async () => {
  const input=document.createElement('input'); document.body.append(input); input.focus();
  await render(); input.focus(); await wait(); expect(claimPopup).not.toHaveBeenCalled();
  input.remove(); await wait(1000); expect(claimPopup).toHaveBeenCalledOnce();
});
it('drops an in-flight claim when navigation becomes sensitive', async () => {
  let finish!: (value: { deliveryId: string; campaign: typeof campaign }) => void;
  vi.mocked(claimPopup).mockImplementation(() => new Promise(resolve => { finish=resolve; }));
  await render(); await wait(); expect(claimPopup).toHaveBeenCalledOnce();
  nav.path='/chats'; await render();
  await act(async () => finish({ deliveryId: 'delivery', campaign }));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(recordPopupEvent).not.toHaveBeenCalled();
});
it('closes without navigation if a campaign supplies an unsafe CTA', async () => {
  vi.mocked(claimPopup).mockResolvedValue({ deliveryId: 'delivery', campaign: { ...campaign, actionPath: 'https://evil.example' } });
  await render(); await wait();
  expect(document.querySelector('[data-popup-action]')).toBeNull();
});
it('records a click once and navigates to the allowed destination', async () => {
  await render(); await wait();
  await act(async () => (document.querySelector('[data-popup-action]') as HTMLButtonElement).click());
  expect(recordPopupEvent).toHaveBeenCalledWith('delivery', 'CLICKED'); expect(nav.push).toHaveBeenCalledWith('/invite');
});
it('restores keyboard focus to the previously focused control after dismissal', async () => {
  const before=document.createElement('button'); before.textContent='Browse'; document.body.append(before); before.focus();
  await render(); await wait();
  expect(document.activeElement).not.toBe(before);
  await act(async () => (document.querySelector('[data-popup-dismiss]') as HTMLButtonElement).click());
  await wait(1);
  expect(document.activeElement).toBe(before);
  before.remove();
});
it('discards a candidate when only search filters change during a claim', async () => {
  let finish!: (value: { deliveryId: string; campaign: typeof campaign }) => void;
  vi.mocked(claimPopup).mockImplementation(() => new Promise(resolve => { finish=resolve; }));
  await render(); await wait();
  window.history.replaceState(null,'','?q=changed');
  await act(async () => finish({deliveryId:'delivery',campaign}));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  window.history.replaceState(null,'','/');
});
it('does not show an expired contextual trigger after a slow claim', async () => {
  const { queuePopupTrigger } = await import('@/lib/popups/triggers');
  queuePopupTrigger('EMPTY_SEARCH','user','slow');
  let finish!: (value: { deliveryId: string; campaign: typeof campaign }) => void;
  vi.mocked(claimPopup).mockImplementation(() => new Promise(resolve => { finish=resolve; }));
  await render(); await wait(61_000);
  await act(async () => finish({deliveryId:'delivery',campaign}));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it('polls at most once a minute even when the contextual trigger expires', async () => {
  const { queuePopupTrigger } = await import('@/lib/popups/triggers');
  queuePopupTrigger('EMPTY_SEARCH','user','poll');
  vi.mocked(nextPopup).mockResolvedValue(null);
  await render(); await wait(61_000); expect(nextPopup).toHaveBeenCalledOnce();
  await wait(15_000); expect(nextPopup).toHaveBeenCalledTimes(2);
});
