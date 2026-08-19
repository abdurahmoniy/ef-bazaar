import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ListingActions } from '@/components/marketplace/listing-actions';
import { MarketplaceListingDetail } from '@/components/marketplace/marketplace-listing-detail';
import { MarketplaceErrorState } from '@/components/marketplace/marketplace-result-state';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import {
  formatPriceUZS,
  parseListingSearchParams,
  searchParamInputToSearchParams,
  type SearchParamInput,
} from '@/lib/marketplace-format';
import { listingMediaUrls } from '@/lib/marketplace-media';
import {
  getListing,
  getSimilarListings,
  getUserProfile,
} from '@/lib/marketplace-server';
import {
  attributeNumber,
  type ListingResponse,
} from '@/lib/marketplace-types';
import { isUserBlacklisted } from '@/lib/gamer-server';
import { getSellerRatingSummary } from '@/lib/trade-server';
import { resolveOptionalUser } from '@/lib/optional-auth';
import { absoluteUrl, siteConfig } from '@/lib/site';

export const dynamic = 'force-dynamic';

interface ListingPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParamInput>;
}

function firstNonEmptyLine(text: string) {
  return text.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
}

function buildListingTitle(listing: ListingResponse) {
  const parts: string[] = [];
  const division = attributeNumber(listing, 'highest_division_level');
  if (division) parts.push(`Divizion ${division}`);
  const strength = attributeNumber(listing, 'team_strength');
  if (strength) parts.push(`${strength} kuch`);
  const head = firstNonEmptyLine(listing.description);
  if (head) parts.push(head);
  const title = parts.filter(Boolean).join(' · ') || 'eFootball akkount';
  return title.length > 80 ? `${title.slice(0, 77)}…` : title;
}

function buildListingDescription(listing: ListingResponse) {
  const flat = listing.description.replace(/\s+/g, ' ').trim();
  const priceUZS = Number(listing.price);
  const priceLabel = Number.isFinite(priceUZS)
    ? `${new Intl.NumberFormat('uz-UZ').format(priceUZS)} so'm`
    : null;
  const parts = [flat.slice(0, 140), priceLabel].filter(Boolean);
  const combined = parts.join(' · ');
  return combined.length > 160 ? `${combined.slice(0, 157)}…` : combined;
}

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getListing(id);
  if (!result.ok) {
    return {
      title: result.error.status === 404 ? "E'lon topilmadi" : "E'lon yuklanmadi",
      robots: { index: false, follow: false },
    };
  }

  const listing = result.data;
  const canonical = `/marketplace/${listing.id}`;
  const title = buildListingTitle(listing);
  const description = buildListingDescription(listing);
  const mediaUrls = listingMediaUrls(listing, 4).map((url) => absoluteUrl(url));
  const ogFallback = absoluteUrl('/opengraph-image');
  const images = mediaUrls.length > 0 ? mediaUrls : [ogFallback];

  // Sold and deleted listings shouldn't be indexed — they can't fulfill the query.
  const isPublic = listing.status === 'ACTIVE';

  return {
    title,
    description,
    alternates: { canonical },
    robots: isPublic
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonical,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      images: images.map((url) => ({ url, alt: title })),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images,
    },
  };
}

function buildListingJsonLd(listing: ListingResponse) {
  const canonicalUrl = absoluteUrl(`/marketplace/${listing.id}`);
  const priceValue = Number(listing.price);
  const images = listingMediaUrls(listing, 6).map((url) => absoluteUrl(url));

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${canonicalUrl}#product`,
    name: buildListingTitle(listing),
    description: listing.description.replace(/\s+/g, ' ').trim().slice(0, 500),
    url: canonicalUrl,
    ...(images.length > 0 ? { image: images } : {}),
    category: 'eFootball account',
    brand: {
      '@type': 'Brand',
      name: 'eFootball',
    },
    offers: {
      '@type': 'Offer',
      url: canonicalUrl,
      priceCurrency: 'UZS',
      price: Number.isFinite(priceValue) ? priceValue : undefined,
      availability:
        listing.status === 'ACTIVE'
          ? 'https://schema.org/InStock'
          : listing.status === 'SOLD'
            ? 'https://schema.org/SoldOut'
            : 'https://schema.org/Discontinued',
      itemCondition: 'https://schema.org/UsedCondition',
    },
    ...(listing.likeCount > 0
      ? {
          interactionStatistic: {
            '@type': 'InteractionCounter',
            interactionType: 'https://schema.org/LikeAction',
            userInteractionCount: listing.likeCount,
          },
        }
      : {}),
  };
}

export default async function ListingPage({ params, searchParams }: ListingPageProps) {
  const { id } = await params;
  const originatingParams = searchParams ? await searchParams : {};
  const matchFilters = parseListingSearchParams(originatingParams);
  const backQuery = searchParamInputToSearchParams(originatingParams).toString();
  const backHref = backQuery ? `/marketplace?${backQuery}` : '/marketplace';
  const [viewer, result] = await Promise.all([
    resolveOptionalUser(getMe),
    getListing(id, matchFilters.matchCards, matchFilters.matchStrictness),
  ]);

  if (!result.ok) {
    if (result.error.status === 404) notFound();
    return (
      <MarketplaceShell user={viewer} activeTab="home" backHref={backHref} backLabel="Bozor">
        <section className="mx-auto w-full max-w-3xl space-y-4">
          <MarketplaceErrorState retryHref={backHref} />
        </section>
      </MarketplaceShell>
    );
  }

  const listing = result.data;
  const [similar, sellerBlacklisted, fallbackSeller, sellerRatingSummary] = await Promise.all([
    getSimilarListings(listing),
    isUserBlacklisted(listing.sellerId),
    listing.seller ? Promise.resolve(null) : getUserProfile(listing.sellerId),
    getSellerRatingSummary(listing.sellerId),
  ]);
  const seller = listing.seller ?? fallbackSeller;

  const jsonLd = JSON.stringify(buildListingJsonLd(listing)).replace(/</g, '\\u003c');

  return (
    <MarketplaceShell
      user={viewer}
      activeTab="home"
      backHref={backHref}
      backLabel="Bozor"
      mobileActionBar={
        <ListingActions
          variant="bar"
          listingId={listing.id}
          priceLabel={formatPriceUZS(listing.price)}
          authenticated={viewer !== null}
          isOwner={viewer?.id === listing.sellerId}
          initialLiked={listing.likedByMe}
          initialLikeCount={listing.likeCount}
          status={listing.status}
        />
      }
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <MarketplaceListingDetail
        listing={listing}
        viewer={viewer}
        seller={seller}
        sellerBlacklisted={sellerBlacklisted}
        sellerRatingSummary={sellerRatingSummary}
        similarListings={similar}
      />
    </MarketplaceShell>
  );
}
