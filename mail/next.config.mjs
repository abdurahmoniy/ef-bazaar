/** @type {import('next').NextConfig} */

const isProduction = process.env.NODE_ENV === 'production';

const mainSiteOrigin = (process.env.NEXT_PUBLIC_MAIN_SITE_URL || 'https://efbazaar.uz')
  .replace(/\/+$/, '');

// Much tighter than the marketplace frontend's CSP: the mail app loads no
// third-party scripts (no Telegram widget, no Google GIS, no analytics) and
// message bodies are server-sanitised HTML with no images, so 'self' covers
// everything.
const contentSecurityPolicy = [
  "default-src 'self'",
  // Dev-only eval: React development mode reconstructs callstacks with eval();
  // production bundles never call it, so prod stays eval-free.
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  `connect-src 'self' ${mainSiteOrigin}`,
  "frame-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isProduction ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  // Private inboxes — nothing on this host may ever be indexed.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
