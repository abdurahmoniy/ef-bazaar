import type { MetadataRoute } from 'next';

import { absoluteUrl, siteConfig } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/bot/',
          '/admin',
          '/admin/',
          '/auth',
          '/auth/',
          '/profile',
          '/profile/',
          '/chats',
          '/chats/',
          '/favorites',
          '/favorites/',
          '/marketplace/new',
          '/marketplace/*/edit',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: siteConfig.url,
  };
}
