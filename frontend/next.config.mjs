/** @type {import('next').NextConfig} */

const isProduction = process.env.NODE_ENV === 'production';

// Content Security Policy — tight in prod, permissive in dev for Next.js HMR.
// Telegram Login Widget: telegram.org iframe + `oauth.telegram.org` postMessage.
// Google Identity Services: accounts.google.com iframe + gstatic scripts.
// Backend API surfaced through `api.efbazaar.uz` (cross-origin fetches).
function buildContentSecurityPolicy() {
  const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.efbazaar.uz';
  const siteOrigin = process.env.NEXT_PUBLIC_BASE_URL || 'https://efbazaar.uz';

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    'https://telegram.org',
    'https://*.telegram.org',
    'https://accounts.google.com',
    'https://apis.google.com',
    'https://www.gstatic.com',
    ...(isProduction ? [] : ["'unsafe-eval'"]),
  ];

  const connectSrc = [
    "'self'",
    apiOrigin,
    siteOrigin,
    'https://accounts.google.com',
    'https://oauth2.googleapis.com',
    'https://*.telegram.org',
    ...(isProduction ? [] : ['ws:', 'wss:', 'http:', 'https:']),
  ];

  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    'https://t.me',
    'https://*.googleusercontent.com',
    'https://*.telegram.org',
    apiOrigin,
  ];

  const frameSrc = [
    "'self'",
    'https://oauth.telegram.org',
    'https://accounts.google.com',
    'https://*.telegram.org',
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src ${imgSrc.join(' ')}`,
    `connect-src ${connectSrc.join(' ')}`,
    `frame-src ${frameSrc.join(' ')}`,
    "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'Content-Security-Policy', value: buildContentSecurityPolicy() },
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 't.me' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'api.efbazaar.uz' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default nextConfig;
