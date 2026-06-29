const DEFAULT_SITE_URL = 'https://efbazaar.chempox.uz';
const DEFAULT_BOT_USERNAME = 'EfBazaarBot';

function normalizeSiteUrl(value?: string) {
  const raw = value?.trim() || DEFAULT_SITE_URL;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  return withProtocol.replace(/\/+$/, '');
}

function normalizeBotUsername(value?: string) {
  return (value?.trim() || DEFAULT_BOT_USERNAME).replace(/^@/, '');
}

const telegramBotUsername = normalizeBotUsername(process.env.NEXT_PUBLIC_TELEGRAM_BOT);

export const siteConfig = {
  name: 'efBazaar',
  title: 'efBazaar - eFootball Account Marketplace',
  description:
    'eFootball akkountlarini Uzbekistonda xavfsiz sotish va sotib olish uchun Telegram-first marketplace.',
  locale: 'uz_UZ',
  language: 'uz',
  url: normalizeSiteUrl(process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL),
  keywords: [
    'efBazaar',
    'eFootball marketplace',
    'eFootball account',
    'eFootball akkount sotish',
    'eFootball akkount sotib olish',
    'PES account',
    'PES akkount',
    'Uzbekistan eFootball',
    'Telegram eFootball savdo',
    'pro accountlar',
  ],
  links: {
    telegram: `https://t.me/${telegramBotUsername}`,
  },
} as const;

export function absoluteUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${siteConfig.url}${normalizedPath}`;
}
