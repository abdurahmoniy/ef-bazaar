import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Link from 'next/link';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMe, getListing, redirect, notFound } = vi.hoisted(() => ({
  getMe: vi.fn(), getListing: vi.fn(),
  redirect: vi.fn((href: string) => { throw new Error(`REDIRECT:${href}`); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
}));
vi.mock('@/lib/auth', () => ({ getMe }));
vi.mock('@/lib/marketplace-server', () => ({ getListing }));
vi.mock('next/navigation', () => ({ redirect, notFound }));
vi.mock('@/components/marketplace/marketplace-shell', () => ({ MarketplaceShell: () => createElement('div') }));
vi.mock('@/components/marketplace/listing-channel-posts', () => ({ ListingChannelPosts: () => createElement('div') }));

import AdvertiseListingPage, { metadata } from '@/app/marketplace/[id]/advertise/page';
import { MarketplaceShell } from './marketplace-shell';
import { ListingChannelPosts } from './listing-channel-posts';
import { MarketplaceErrorState } from './marketplace-result-state';

function findElement(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (!isValidElement<Record<string, unknown>>(node)) return;
  if (node.type === type) return node;
  const children = node.props.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findElement(child as ReactNode, type);
    if (found) return found;
  }
}
const props = (channel?: string | string[]) => ({ params: Promise.resolve({ id: 'listing-1' }), searchParams: Promise.resolve({ channel }) });

beforeEach(() => {
  vi.clearAllMocks();
  getMe.mockResolvedValue({ id: 'owner' });
  getListing.mockResolvedValue({ ok: true, data: { id: 'listing-1', sellerId: 'owner', status: 'ACTIVE', description: 'Epic Messi', price: 100_000 } });
});

describe('advertising page access', () => {
  it('preserves the complete selected destination through guest login without fetching the listing', async () => {
    getMe.mockResolvedValue(null);
    await expect(AdvertiseListingPage(props(['one', 'two', 'one', '../bad']))).rejects.toThrow('REDIRECT:');
    const target = new URL(redirect.mock.calls[0][0], 'https://efbazaar.uz');
    expect(target.pathname).toBe('/auth/login');
    expect(target.searchParams.get('from')).toBe('/marketplace/listing-1/advertise?channel=one&channel=two');
    expect(getListing).not.toHaveBeenCalled();
  });

  it('redirects non-owners to the listing without rendering purchase UI', async () => {
    getMe.mockResolvedValue({ id: 'buyer' });
    await expect(AdvertiseListingPage(props())).rejects.toThrow('REDIRECT:/marketplace/listing-1');
  });

  it.each(['SOLD', 'DELETED'])('does not offer advertising for an owner’s %s listing', async (status) => {
    getListing.mockResolvedValue({ ok: true, data: { id: 'listing-1', sellerId: 'owner', status } });
    await expect(AdvertiseListingPage(props())).rejects.toThrow('REDIRECT:/marketplace/listing-1');
  });

  it('renders only the allowed owner journey and sanitized initial selection', async () => {
    const page = await AdvertiseListingPage(props(['one', 'two', 'one', 'x&price=1']));
    expect(page?.type).toBe(MarketplaceShell);
    expect(page?.props).toMatchObject({ hideSearch: true, hideBottomNav: true, backHref: '/marketplace/listing-1' });
    expect(findElement(page, ListingChannelPosts)?.props).toMatchObject({ listingId: 'listing-1', initialChannelIds: ['one', 'two'] });
    expect(metadata).toMatchObject({ robots: { index: false, follow: false } });
  });

  it('returns not found for a missing listing', async () => {
    getListing.mockResolvedValue({ ok: false, error: { status: 404 } });
    await expect(AdvertiseListingPage(props())).rejects.toThrow('NOT_FOUND');
  });

  it('identifies the saved listing and links back to its detail', async () => {
    const page = await AdvertiseListingPage(props());
    const summary = findElement(page, Link);
    expect(summary?.props.href).toBe('/marketplace/listing-1');
    const markup = renderToStaticMarkup(summary);
    expect(markup).toContain('Epic Messi');
    expect(markup).toContain('100 000 so&#x27;m');
  });

  it('offers a retry retaining selection after a temporary listing load failure', async () => {
    getListing.mockResolvedValue({ ok: false, error: { status: 503 } });
    const page = await AdvertiseListingPage(props(['one']));
    expect(findElement(page, ListingChannelPosts)).toBeUndefined();
    expect(findElement(page, MarketplaceErrorState)?.props.retryHref).toBe('/marketplace/listing-1/advertise?channel=one');
  });
});
