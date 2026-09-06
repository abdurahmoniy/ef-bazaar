import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import { ListingChannelPosts } from '@/components/marketplace/listing-channel-posts';
import { MarketplaceErrorState } from '@/components/marketplace/marketplace-result-state';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { listingAdvertisingHref, parseAdvertisingChannels } from '@/lib/listing-advertising';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { getListing } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "E'lonni reklama qilish",
  robots: { index: false, follow: false },
};

interface AdvertisePageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ channel?: string | string[] }>;
}

export default async function AdvertiseListingPage({ params, searchParams }: AdvertisePageProps) {
  const { id } = await params;
  const initialChannelIds = parseAdvertisingChannels((await searchParams)?.channel);
  const advertisingHref = listingAdvertisingHref(id, initialChannelIds);
  const detailHref = `/marketplace/${encodeURIComponent(id)}`;
  const user = await getMe();
  if (!user) redirect(`/auth/login?${new URLSearchParams({ from: advertisingHref })}`);

  const result = await getListing(id);
  if (!result.ok) {
    if (result.error.status === 404) notFound();
    return (
      <MarketplaceShell user={user} hideSearch hideBottomNav backHref={detailHref} backLabel="E'longa qaytish">
        <section className="mx-auto w-full max-w-3xl">
          <MarketplaceErrorState retryHref={advertisingHref} />
        </section>
      </MarketplaceShell>
    );
  }
  if (result.data.sellerId !== user.id || result.data.status !== 'ACTIVE') redirect(detailHref);

  return (
    <MarketplaceShell user={user} hideSearch hideBottomNav backHref={detailHref} backLabel="E'longa qaytish">
      <section className="mx-auto w-full max-w-3xl space-y-5">
        <header>
          <h1 className="text-2xl font-black text-foreground sm:text-3xl">E&apos;lonni reklama qilish</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            E&apos;loningiz uchun kanallarni tanlang va buyurtma shartlarini ko&apos;rib chiqing.
          </p>
        </header>
        <Link
          href={detailHref}
          className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-sm font-semibold text-foreground">{result.data.description.split('\n')[0]?.trim() || "E'lon"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatPriceUZS(result.data.price)}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
        <ListingChannelPosts listingId={result.data.id} initialChannelIds={initialChannelIds} />
      </section>
    </MarketplaceShell>
  );
}
