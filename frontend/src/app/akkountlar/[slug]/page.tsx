import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Package2 } from 'lucide-react';

import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingCard } from '@/components/marketplace/listing-card';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { SiteFooter } from '@/components/site-footer';
import { getMe } from '@/lib/auth';
import { buildListingSearchParams, formatCompactNumber } from '@/lib/marketplace-format';
import { getMarketplaceLanding, type MarketplaceLandingDef } from '@/lib/marketplace-landing';
import { browseListings, searchCards } from '@/lib/marketplace-server';
import type { ListingBrowseParams, ListingResponse } from '@/lib/marketplace-types';
import { resolveOptionalUser } from '@/lib/optional-auth';
import { absoluteUrl, siteConfig } from '@/lib/site';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

interface LandingPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: LandingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const def = getMarketplaceLanding(slug);
  if (!def) {
    return { title: 'Sahifa topilmadi', robots: { index: false, follow: false } };
  }

  const canonical = `/akkountlar/${def.slug}`;
  return {
    title: def.title,
    description: def.description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: `${def.title} | ${siteConfig.name}`,
      description: def.description,
      url: canonical,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
    },
    twitter: {
      card: 'summary_large_image',
      title: def.title,
      description: def.description,
    },
  };
}

async function resolveLandingParams(def: MarketplaceLandingDef): Promise<ListingBrowseParams> {
  if (!def.playerQuery) return def.params;
  const cards = await searchCards(def.playerQuery, 1);
  const cardName = cards[0]?.name ?? def.playerQuery;
  return {
    ...def.params,
    attributes: { ...(def.params.attributes ?? {}), valuable_players_name: cardName },
  };
}

function marketplaceHref(filters: ListingBrowseParams) {
  const search = buildListingSearchParams(filters);
  const query = search.toString();
  return query ? `/marketplace?${query}` : '/marketplace';
}

function buildLandingJsonLd(def: MarketplaceLandingDef, listings: ListingResponse[]) {
  const url = absoluteUrl(`/akkountlar/${def.slug}`);
  const active = listings.filter((listing) => listing.status === 'ACTIVE');

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Bosh sahifa', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Bozor', item: absoluteUrl('/marketplace') },
        { '@type': 'ListItem', position: 3, name: def.label, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: def.h1,
      url,
      numberOfItems: active.length,
      itemListElement: active.map((listing, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: absoluteUrl(`/marketplace/${listing.id}`),
      })),
    },
  ];
}

export default async function MarketplaceLandingPage({ params }: LandingPageProps) {
  const { slug } = await params;
  const def = getMarketplaceLanding(slug);
  if (!def) notFound();

  const filters = await resolveLandingParams(def);
  const [viewer, result] = await Promise.all([
    resolveOptionalUser(getMe),
    browseListings({ ...filters, size: PAGE_SIZE, sort: 'createdAt,desc' }),
  ]);

  const page = result.ok ? result.data : null;
  const jsonLd = JSON.stringify(buildLandingJsonLd(def, page?.content ?? [])).replace(
    /</g,
    '\\u003c',
  );
  return (
    <MarketplaceShell user={viewer} activeTab="home" backHref="/marketplace" backLabel="Bozor">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <section className="space-y-4">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Marketplace</p>
          <h1 className="mt-1 text-2xl font-black leading-tight text-foreground">{def.h1}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{def.intro}</p>
          {page && (
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {formatCompactNumber(page.totalElements)} ta e&apos;lon
            </p>
          )}
        </div>

        {!result.ok ? (
          <ApiErrorPanel title="E'lonlar yuklanmadi" error={result.error} />
        ) : page === null || page.content.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-4 py-16 text-center shadow-card">
            <Package2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <h2 className="mt-3 text-base font-bold text-foreground">
              Bu kategoriyada hozircha e&apos;lon yo&apos;q
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Bozorda boshqa akkountlarni ko&apos;rib chiqing — yangi e&apos;lonlar tez-tez
              qo&apos;shiladi.
            </p>
            <Link
              href="/marketplace"
              className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary"
            >
              Bozorga o&apos;tish <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {page.content.map((listing) => (
                <ListingCard key={listing.id} listing={listing} variant="grid" />
              ))}
            </div>
            <div className="pt-1">
              <Link
                href={marketplaceHref(filters)}
                className="inline-flex items-center gap-1 text-sm font-bold text-primary"
              >
                Bozorda filtr bilan ochish <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </section>

      <SiteFooter embedded />
    </MarketplaceShell>
  );
}
