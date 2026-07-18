import type { MetadataRoute } from 'next';

// Private inboxes — the whole host is off-limits to crawlers.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
