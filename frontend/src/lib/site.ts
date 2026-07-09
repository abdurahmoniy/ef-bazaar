const DEFAULT_SITE_URL = 'https://efbazaar.uz';
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
  title: 'efBazaar — eFootball akkount bozori: Epic, Big Time, Show Time kartalar',
  description:
    "Messi Epic, Ronaldo Big Time, Show Time — yulduz karta bo'yicha eFootball akkountlarini toping. Diviziyon, jamoa kuchi, Android/iOS tangalari va obmen shartlari — hammasi ochiq. O'zbekiston uchun Telegram-first marketplace.",
  locale: 'uz_UZ',
  language: 'uz',
  url: normalizeSiteUrl(process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL),
  keywords: [
    'efBazaar',
    'efbazaar.uz',
    'eFootball marketplace',
    'eFootball akkount sotish',
    'eFootball akkount sotib olish',
    'eFootball akkount obmen',
    'eFootball akkount almashinuv',
    'eFootball Epic karta',
    'eFootball Big Time',
    'eFootball Show Time',
    'eFootball Division 1 akkount',
    'eFootball Messi Epic',
    'eFootball Ronaldo',
    'eFootball Mbappe',
    "eFootball jamoa kuchi",
    "eFootball tanga sotish",
    'eFootball Android akkount',
    'eFootball iOS Game Center',
    'PES account',
    'PES akkount',
    'Uzbekistan eFootball',
    'Telegram eFootball savdo',
  ],
  links: {
    telegram: `https://t.me/${telegramBotUsername}`,
  },
} as const;

export function absoluteUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${siteConfig.url}${normalizedPath}`;
}
