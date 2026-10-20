// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getMe: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getMe: mocks.getMe }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), notFound: () => { throw new Error('not found'); } }));
vi.mock('@/lib/partner-click-server', () => ({ recordChannelClick: vi.fn() }));
vi.mock('@/lib/gamer-server', () => ({ isUserBlacklisted: async () => false }));
vi.mock('@/lib/trade-server', () => ({ getSellerRatingSummary: async () => null }));
vi.mock('@/lib/rec-server', () => ({ getListingMatch: async () => null }));
vi.mock('@/lib/marketplace-actions', () => ({ toggleListingLike: vi.fn(), markListingSold: vi.fn(), relistListing: vi.fn() }));
vi.mock('@/lib/marketplace-server', () => ({ getListing: async () => ({ ok: true, data: { id: 'listing', description: 'Public listing', sellerId: 'seller', price: 10000, status: 'ACTIVE', attributes: {}, likeCount: 0, mediaMessageIds: [] } }), getSimilarListings: async () => [], getUserProfile: async () => null }));
vi.mock('@/components/marketplace/marketplace-shell', () => ({ MarketplaceShell: ({ children, mobileActionBar }: { children: ReactNode; mobileActionBar: ReactNode }) => createElement('main', null, createElement('aside', { 'data-mobile': true }, mobileActionBar), children) }));
// Keep the route's desktop boundary while isolating unrelated presentation leaves.
vi.mock('@/components/marketplace/marketplace-listing-detail', () => ({ MarketplaceListingDetail: ({ listing, viewer }: { listing: { id: string }; viewer: { id: string } | null }) => createElement('section', { 'data-desktop': true }, createElement(ListingActions, { listingId: listing.id, authenticated: Boolean(viewer), initialLikeCount: 0 })) }));
import { ListingActions } from '@/components/marketplace/listing-actions';
import Page from '@/app/marketplace/[id]/page';
let identity: string;
let host: HTMLDivElement;
let root: Root;
const fetcher = vi.fn();
beforeEach(() => { identity = 'A'; mocks.getMe.mockImplementation(async () => ({ id: identity, roles: [] })); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', fetcher); fetcher.mockResolvedValue(Response.json({ id: 'watch' })); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function render() { const element = await Page({ params: Promise.resolve({ id: 'listing' }) }); await act(async () => root.render(element)); }
it.each(['mobile', 'desktop'])('keeps the same owner opt-in but clears %s price-watch state for the next principal', async surface => {
  await render();
  const panel = () => host.querySelector(`[data-${surface}]`)!;
  const watch = () => [...panel().querySelectorAll('button')].find(button => button.textContent?.includes('Narxni kuzatish'));
  await act(async () => watch()!.click()); expect(panel().textContent).toContain('Kuzatuv saqlandi');
  await render(); expect(panel().textContent).toContain('Kuzatuv saqlandi');
  identity = 'B'; await render();
  expect(panel().textContent).not.toContain('Kuzatuv saqlandi'); expect(watch()).toBeTruthy();
  await act(async () => watch()!.click()); expect(fetcher).toHaveBeenCalledTimes(2);
});
