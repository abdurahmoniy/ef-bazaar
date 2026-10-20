// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ getMe: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getMe: auth.getMe }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: (href: string) => { throw new Error(href); } }));
vi.mock('@/components/marketplace/marketplace-shell', () => ({ MarketplaceShell: ({ children }: { children: ReactNode }) => createElement('main', null, children) }));
vi.mock('@/lib/plans-server', () => ({
  getMyPlanSSR: async () => ({ code: 'STANDARD', expiresAt: null, entitlements: {} }),
  getPlanCatalogSSR: async () => [{ code: 'PRO', sortOrder: 1, entitlements: { 'mailbox.total_slots': '10', 'mailbox.custom_slots': '2' }, prices: { MONTH: 3000000 } }],
}));
vi.mock('@/lib/accounts-server', () => ({ getMyAccountsServer: async () => [] }));
vi.mock('@/lib/account-display-server', () => ({ getAccountDisplayData: async () => ({}) }));
vi.mock('@/lib/marketplace-server', () => ({ getMyFavorites: async () => [] }));
vi.mock('@/lib/trade-server', () => ({ getMyCards: async () => [], getMyTrades: async () => null, getSellerRatingSummary: async () => null }));
vi.mock('@/lib/trade-admin-applications-server', () => ({ getMyTradeAdminApplication: async () => null }));
vi.mock('@/lib/payment-server', () => ({ getWallet: async () => null }));
vi.mock('@/lib/custom-mailbox-server', () => ({ getMyMailboxesSSR: async () => [], getMyCustomMailboxesSSR: async () => [], getMailboxSlotsSSR: async () => null }));
vi.mock('@/components/profile/profile-account', () => ({ ProfileAccount: () => null }));
vi.mock('@/components/profile/profile-accounts', () => ({ ProfileAccounts: () => null }));
import WatchesPage from '@/app/watches/page';
import AnalyticsPage from '@/app/seller-analytics/page';
import ProfilePage from '@/app/profile/page';
import PlansPage from '@/app/plans/page';
import CustomPage from '@/app/mailboxes/custom/page';
let identity: string;
let host: HTMLDivElement;
let root: Root;
const fetcher = vi.fn();
const coverage = { collectionStartedAt: '2026-10-01T00:00:00Z', timezone: 'Asia/Samarkand', historyPartial: true };
const watchList = (owner: string) => ({ available: true, limit: 5, immediate: true, items: [{ id: `${owner}-search`, name: `${owner} private search`, matchCard: [], matchStrictness: 4, minPrice: 5000, maxPrice: null, paused: false, pauseReason: null, notificationsEnabled: true }] });
function response(url: string) {
  if (url.includes('/saved-searches')) return Response.json(watchList(identity));
  if (url.includes('/price-watches')) return Response.json({ available: true, limit: 20, immediate: true, items: [], notificationsEnabled: true, telegramEnabled: false });
  if (url.endsWith('/summary')) return Response.json({ listingCount: identity === 'A' ? 11 : 22, uniqueViews: 0, currentFavorites: 0, inquiries: 0, coverage, capabilities: { status: 'AVAILABLE', historyDays: 90, exportEnabled: true } });
  if (url.includes('/report?')) return Response.json({ days: 90, page: 0, size: 50, totalListings: 0, fromDate: '2026-07-23', toDate: '2026-10-20', coverage, totals: { uniqueViews: 0, saveAdditions: 0, inquiries: 0, completedTrades: 0, grossSalesUzs: '0' }, daily: [], listings: [] });
  if (url.endsWith('/resources')) return Response.json([{ id: `${identity}-box`, email: `${identity}-private@efbazaar.uz`, ownerUserId: identity, kind: 'RANDOM', usageBytes: null, quotaBytes: null, usageStatus: 'UNKNOWN', activeTrade: false, legalHold: false, deletionStatus: 'NONE' }]);
  if (url.endsWith('/notices')) return Response.json([{ id: `${identity}-notice`, kind: 'EXPIRED', paidExpiresAt: identity === 'A' ? '2025-01-01T00:00:00Z' : '2026-01-01T00:00:00Z', graceEndsAt: null, createdAt: '2026-10-20T00:00:00Z', readAt: null }]);
  if (url.endsWith('/slots')) return Response.json({ totalUsed: identity === 'A' ? 1 : 2, totalLimit: 3, customUsed: 0, customLimit: 0, lockedCount: 0, plan: 'STANDARD', full: false });
  if (url.endsWith('/purchase')) return Response.json({ code: 'PRO', expiresAt: '2026-11-20T00:00:00Z', entitlements: {} });
  throw new Error(`Unexpected request ${url}`);
}
beforeEach(() => {
  identity = 'A';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  auth.getMe.mockImplementation(async () => ({ id: identity, roles: [], displayName: identity }));
  vi.stubGlobal('fetch', fetcher);
  fetcher.mockImplementation(async (url: string) => response(url));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function render(page: 'watches' | 'analytics' | 'profile' | 'accounts' | 'plans' | 'custom') {
  const element = page === 'watches' ? await WatchesPage({}) : page === 'analytics' ? await AnalyticsPage() : page === 'plans' ? await PlansPage() : page === 'custom' ? await CustomPage({ searchParams: Promise.resolve({}) }) : await ProfilePage({ searchParams: Promise.resolve({ tab: page === 'accounts' ? 'accounts' : 'account' }) });
  await act(async () => root.render(element));
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(button => button.textContent?.includes(label));
  expect(button, label).toBeTruthy(); await act(async () => button!.click());
}
it('drops prior owner watches and unsaved criteria only when the principal changes', async () => {
  await render('watches'); expect(host.textContent).toContain('A private search');
  const input = host.querySelector('input[maxlength="100"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'A private draft'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await render('watches'); expect((host.querySelector('input[maxlength="100"]') as HTMLInputElement).value).toBe('A private draft');
  identity = 'B'; await render('watches');
  expect(host.textContent).not.toContain('A private search'); expect(host.textContent).toContain('B private search');
  expect((host.querySelector('input[maxlength="100"]') as HTMLInputElement).value).not.toBe('A private draft');
});
it('ignores a prior owner watch response that finishes after the principal changes', async () => {
  let finish!: (response: Response) => void;
  fetcher.mockImplementation((url: string) => identity === 'A' && url.includes('/saved-searches') ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(response(url)));
  await render('watches'); identity = 'B'; await render('watches');
  await act(async () => finish(Response.json(watchList('A'))));
  expect(host.textContent).toContain('B private search'); expect(host.textContent).not.toContain('A private search');
});
it('replaces seller statistics and aborts an earlier owner export on a principal change', async () => {
  await render('analytics'); expect(host.textContent).toContain('11');
  let finish!: (response: Response) => void;
  const create = vi.fn(); Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
  fetcher.mockImplementation((url: string) => url.includes('/export?') ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(response(url)));
  await click('CSV yuklash');
  const signal = fetcher.mock.calls.find(([url]) => url.includes('/export?'))![1].signal;
  identity = 'B'; await render('analytics');
  expect(signal.aborted).toBe(true);
  await act(async () => finish(new Response('A private CSV', { headers: { 'Content-Type': 'text/csv' } })));
  expect(create).not.toHaveBeenCalled(); expect(host.textContent).toContain('22'); expect(host.textContent).not.toContain('11');
});
it('replaces mailbox resources and plan notices when the profile principal changes', async () => {
  await render('profile'); expect(host.textContent).toContain('A-private@'); expect(host.textContent).toContain('2025');
  identity = 'B'; await render('profile');
  expect(host.textContent).toContain('B-private@'); expect(host.textContent).not.toContain('A-private@'); expect(host.textContent).not.toContain('2025');
});
it('reloads allocation counters when the account-tab principal changes', async () => {
  await render('accounts'); expect(host.textContent).toContain('Jami: 1 / 3');
  identity = 'B'; await render('accounts');
  expect(host.textContent).toContain('Jami: 2 / 3'); expect(host.textContent).not.toContain('Jami: 1 / 3');
});
it('clears the prior owner purchase completion when a different principal opens the same plans route', async () => {
  await render('plans'); await click('Tanlash'); expect(host.textContent).toContain('Xarid qabul qilindi');
  await render('plans'); expect(host.textContent).toContain('Xarid qabul qilindi');
  identity = 'B'; await render('plans');
  expect(host.textContent).not.toContain('Xarid qabul qilindi'); expect([...host.querySelectorAll('button')].some(button => button.textContent?.includes('Tanlash') && !button.disabled)).toBe(true);
});

it('resets custom mailbox drafts and suppresses a late claim redirect after the principal changes', async () => {
  vi.useFakeTimers();
  try {
    let finish!: (response: Response) => void;
    fetcher.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Promise(resolve => { finish = resolve; });
      if (url.includes('/availability?')) return Promise.resolve(Response.json({ email: 'aprivatename@efbazaar.uz', available: true, canClaim: true, reason: null, claimBlock: null }));
      return Promise.resolve(response(url));
    });
    await render('custom');
    const field = host.querySelector('input#custom-local')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, 'aprivatename'); field.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await render('custom'); expect((host.querySelector('input#custom-local') as HTMLInputElement).value).toBe('aprivatename');
    await click('Olish');
    identity = 'B'; await render('custom');
    expect((host.querySelector('input#custom-local') as HTMLInputElement).value).toBe('');
    await act(async () => finish(Response.json({ id: 'A-private-box', email: 'aprivatename@efbazaar.uz' })));
    expect(router.push).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.find(([, init]) => init?.method === 'POST')![1].signal.aborted).toBe(true);
  } finally { vi.useRealTimers(); }
});
