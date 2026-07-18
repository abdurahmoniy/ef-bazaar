import type { MetadataRoute } from 'next';

import { MARKETPLACE_LANDINGS } from '@/lib/marketplace-landing';
import { browseListings } from '@/lib/marketplace-server';
import { absoluteUrl } from '@/lib/site';

// Google indexes at most 50k URLs per sitemap; we cap much lower since it also
// bounds how much we ask the marketplace API for on every crawl.
const MAX_LISTINGS_IN_SITEMAP = 1000;

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: absoluteUrl('/marketplace'),
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/auth/login'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    ...MARKETPLACE_LANDINGS.map((def) => ({
      url: absoluteUrl(`/akkountlar/${def.slug}`),
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];

  const listingEntries: MetadataRoute.Sitemap = [];
  try {
    const result = await browseListings({
      size: MAX_LISTINGS_IN_SITEMAP,
      sort: 'createdAt,desc',
    });
    if (result.ok) {
      for (const listing of result.data.content) {
        if (listing.status !== 'ACTIVE') continue;
        listingEntries.push({
          url: absoluteUrl(`/marketplace/${listing.id}`),
          lastModified: new Date(listing.updatedAt || listing.createdAt),
          changeFrequency: 'daily',
          priority: 0.7,
        });
      }
    }
  } catch {
    // sitemap.xml must not 500 — an unreachable API just yields the static entries.
  }

  return [...staticEntries, ...listingEntries];
}
