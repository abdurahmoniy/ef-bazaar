import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getMe: vi.fn(), apiFetch: vi.fn(), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }) }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getMe: mocks.getMe }));
vi.mock('@/lib/api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/components/marketplace/marketplace-shell', () => ({ MarketplaceShell: () => null }));
vi.mock('@/components/seller-analytics/seller-analytics-view', () => ({ SellerAnalyticsView: () => null }));
import SellerAnalyticsPage, { metadata } from './page';
afterEach(() => vi.resetAllMocks());
it('awaits canonical Free initialization but passes no payment-derived analytics grants', async () => {
  mocks.getMe.mockResolvedValue({ id: 'fresh-free' });
  let finish!: (value: unknown) => void;
  mocks.apiFetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  let rendered = false;
  const result = SellerAnalyticsPage().then(element => { rendered = true; return element; });
  await Promise.resolve(); await Promise.resolve();
  expect(mocks.apiFetch).toHaveBeenCalledWith('/payment/v1/payments/plans/me');
  expect(rendered).toBe(false);
  finish({ code: 'PRO', entitlements: { 'analytics.history_days': 90 } });
  const element = await result;
  expect(element.props.children.props).toEqual({});
  expect(metadata.robots).toEqual({ index: false, follow: false });
});
it('keeps analytics available to load basic counts when payment is down', async () => {
  mocks.getMe.mockResolvedValue({ id: 'fresh-free' }); mocks.apiFetch.mockRejectedValue(new Error('payment unavailable'));
  expect(await SellerAnalyticsPage()).toBeTruthy();
});
it('authenticates before loading analytics or initializing payment', async () => {
  mocks.getMe.mockResolvedValue(null); mocks.redirect.mockImplementation(href => { throw new Error(`redirect:${href}`); });
  await expect(SellerAnalyticsPage()).rejects.toThrow('redirect:/auth/login?from=%2Fseller-analytics');
  expect(mocks.apiFetch).not.toHaveBeenCalled();
});
