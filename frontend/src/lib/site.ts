const DEFAULT_SITE_URL = 'https://efbazaar.uz';
const DEFAULT_MAIL_URL = 'https://mail.efbazaar.uz';
const DEFAULT_BOT_USERNAME = 'EfBazaarBot';
const DEFAULT_TELEGRAM_CHANNEL = 'efbazaar';
const DEFAULT_INSTAGRAM_URL = 'https://www.instagram.com/efbazaar.uz';

function normalizeSiteUrl(value?: string) {
  const raw = value?.trim() || DEFAULT_SITE_URL;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  return withProtocol.replace(/\/+$/, '');
}

function normalizeBotUsername(value?: string) {
  return (value?.trim() || DEFAULT_BOT_USERNAME).replace(/^@/, '');
}

function normalizeTelegramChannel(value?: string) {
  const raw = value?.trim() || DEFAULT_TELEGRAM_CHANNEL;
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, '');
  }
  const clean = raw.replace(/^@/, '');
  return `https://t.me/${clean}`;
}

function normalizeInstagramUrl(value?: string) {
  const raw = value?.trim() || DEFAULT_INSTAGRAM_URL;
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, '');
  }
  const clean = raw.replace(/^@/, '');
  return `https://instagram.com/${clean}`;
}

const telegramBotUsername = normalizeBotUsername(process.env.NEXT_PUBLIC_TELEGRAM_BOT);
const telegramChannelUrl = normalizeTelegramChannel(process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL);
const instagramUrl = normalizeInstagramUrl(process.env.NEXT_PUBLIC_INSTAGRAM_URL);

export const siteConfig = {
  name: 'eFBazaar',
  title: 'eFBazaar — eFootball akkount bozori: Epic, Big Time, Show Time kartalar',
  description:
    "O‘zbekiston uchun eFootball akkountlar bozori: Epic, Big Time, Show Time kartalari bo‘yicha qidiruv. Mobile uchun Garov (Escrow) va oldindan ko‘rinadigan komissiya; Steam va PlayStation uchun admin yordami.",
  locale: 'uz_UZ',
  language: 'uz',
  url: normalizeSiteUrl(process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL),
  // The webmail lives on its own host, so a link to an inbox cannot be a
  // relative path the way every other destination here is.
  mailUrl: normalizeSiteUrl(process.env.NEXT_PUBLIC_MAIL_URL || DEFAULT_MAIL_URL),
  keywords: [
    'eFBazaar',
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
    telegramBot: `https://t.me/${telegramBotUsername}`,
    telegramChannel: telegramChannelUrl,
    instagram: instagramUrl,
  },
} as const;

export function absoluteUrl(path = '/') {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${siteConfig.url}${normalizedPath}`;
}
