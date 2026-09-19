/** @type {import('next').NextConfig} */

const isProduction = process.env.NODE_ENV === 'production';

// Content Security Policy — tight in prod, permissive in dev for Next.js HMR.
// Telegram Login Widget: telegram.org iframe + `oauth.telegram.org` postMessage.
// Google Identity Services: accounts.google.com iframe + gstatic scripts.
// Backend API surfaced through `api.efbazaar.uz` (cross-origin fetches).
function buildContentSecurityPolicy() {
  const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.efbazaar.uz';
  const siteOrigin = process.env.NEXT_PUBLIC_BASE_URL || 'https://efbazaar.uz';
  // Chempionat-X — turnirlar public API'si, browser'dan RTK Query orqali to'g'ridan.
  const chempionatOrigin = (() => {
    const raw = process.env.NEXT_PUBLIC_CHEMPIONAT_API_URL;
    if (!raw) return 'https://api.chempox.uz';
    try {
      return new URL(raw).origin;
    } catch {
      return 'https://api.chempox.uz';
    }
  })();

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    // Telegram Login Widget internally calls `eval()` to boot its iframe.
    // Without this the widget silently fails to attach (login iframe never
    // renders) and the error surfaces as "iframe yuklanmadi". No known
    // workaround short of dropping the official widget, so allow eval globally.
    "'unsafe-eval'",
    'https://telegram.org',
    'https://*.telegram.org',
    'https://accounts.google.com',
    'https://apis.google.com',
    'https://www.gstatic.com',
    // Yandex Metrika (analytics + webvisor)
    'https://mc.yandex.ru',
    'https://mc.yandex.com',
    'https://yastatic.net',
  ];

  const connectSrc = [
    "'self'",
    apiOrigin,
    siteOrigin,
    chempionatOrigin,
    'https://accounts.google.com',
    'https://oauth2.googleapis.com',
    'https://firebaseinstallations.googleapis.com',
    'https://fcmregistrations.googleapis.com',
    'https://*.telegram.org',
    'https://mc.yandex.ru',
    'https://mc.yandex.com',
    'https://mc.webvisor.org',
    'https://mc.webvisor.com',
    ...(isProduction ? [] : ['ws:', 'wss:', 'http:', 'https:']),
  ];

  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    siteOrigin,
    'https://efbazaar.uz',
    'https://t.me',
    'https://*.googleusercontent.com',
    'https://*.telegram.org',
    'https://efimg.com',
    'https://*.efimg.com',
    'https://mc.yandex.ru',
    'https://mc.yandex.com',
    apiOrigin,
  ];

  const frameSrc = [
    "'self'",
    'https://oauth.telegram.org',
    'https://accounts.google.com',
    'https://*.telegram.org',
    'https://mc.yandex.ru',
    'https://mc.yandex.com',
  ];

  const mediaSrc = [
    "'self'",
    'blob:',
    'data:',
    siteOrigin,
    'https://efbazaar.uz',
    'https://*.efbazaar.uz',
  ];

  return [
    "default-src 'self'",
    "worker-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    // Google Identity Services fetches `accounts.google.com/gsi/style` for the
    // sign-in button; block that stylesheet and the button renders unstyled/broken.
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "font-src 'self' data:",
    `img-src ${imgSrc.join(' ')}`,
    `media-src ${mediaSrc.join(' ')}`,
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

// Webmail moved to its own app on the mail subdomain; old in-app /mail links
// (profile tab, login `from=` round-trips, bookmarks) redirect there 1:1.
const mailAppUrl = (process.env.NEXT_PUBLIC_MAIL_BASE_URL || 'https://mail.efbazaar.uz')
  .replace(/\/+$/, '');

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  async redirects() {
    return [
      {
        source: '/mail/:path*',
        destination: `${mailAppUrl}/:path*`,
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/bot/:path*',
        destination: 'https://efbazaar.uz/bot/:path*',
      },
    ];
  },
  images: {
    qualities: [75, 90, 95],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      { protocol: 'https', hostname: 'efbazaar.uz' },
      { protocol: 'https', hostname: 't.me' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'api.efbazaar.uz' },
      { protocol: 'https', hostname: 'efimg.com', pathname: '/efootballhub22/images/**' },
      { protocol: 'https', hostname: '*.efimg.com', pathname: '/efootballhub22/images/**' },
    ],
  },
  async headers() {
    // Non-public app surfaces — never fed to a search index even if a stray
    // link leaks. Kept in sync with the disallow list in robots.ts.
    const privatePaths = [
      '/api/:path*',
      '/bot/:path*',
      '/admin/:path*',
      '/auth/:path*',
      '/profile/:path*',
      '/chats/:path*',
      '/favorites/:path*',
      '/marketplace/new',
      '/marketplace/:id/edit',
    ];
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      ...privatePaths.map((source) => ({
        source,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      })),
      // Sitemap + robots should be freshly re-crawled but cached briefly at the
      // edge to absorb Googlebot bursts without hitting the backend every time.
      {
        source: '/sitemap.xml',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=3600, must-revalidate' },
          { key: 'Content-Type', value: 'application/xml; charset=utf-8' },
        ],
      },
      {
        source: '/robots.txt',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=86400, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
