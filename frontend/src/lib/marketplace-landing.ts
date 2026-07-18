import type { ListingBrowseParams } from './marketplace-types';

/**
 * SEO landing pages — static-path variants of the common marketplace filters.
 *
 * Query-param filters on /marketplace all collapse into one canonical URL, so
 * search intents like "divizion 1 akkount" or "efootball steam akkount" have
 * nothing to rank. Each entry here becomes an indexable page at
 * /akkountlar/<slug> with its own title, H1, intro text and ItemList JSON-LD,
 * and is listed in sitemap.ts.
 *
 * Slugs are URLs — renaming one after it's indexed loses the ranking, so treat
 * them as append-only.
 */
export interface MarketplaceLandingDef {
  slug: string;
  /** Short label for category chips and cross-links. */
  label: string;
  /** <title> — the root layout template appends "| eFBazaar". */
  title: string;
  /** Meta description (~160 chars). */
  description: string;
  h1: string;
  /** One-two indexable sentences rendered under the H1. */
  intro: string;
  /** Pre-applied browse filters (page/size/sort are set by the route). */
  params: ListingBrowseParams;
  /**
   * Player pages filter cards by exact card name, but the canonical name
   * ("L. Messi") lives in the card catalog — the route resolves this query
   * via cards/search first and falls back to the raw value.
   */
  playerQuery?: string;
}

function division(level: 1 | 2 | 3 | 4): MarketplaceLandingDef {
  const label = level === 4 ? 'Divizion 4+' : `Divizion ${level}`;
  const tone =
    level === 1
      ? "eng yuqori bosqichga chiqqan kuchli jamoalar"
      : level === 4
        ? "boshlang'ich narxlardagi starter akkountlar"
        : "o'rta bosqichdagi mustahkam jamoalar";
  return {
    slug: `divizion-${level}`,
    label,
    title: `${label} eFootball akkountlar — narxlari bilan`,
    description: `${label} darajasidagi eFootball akkountlar: ${tone}. Jamoa kuchi, tanga miqdori va narxi ochiq — sotuvchi bilan Telegram orqali bevosita bog'laning.`,
    h1: `${label} eFootball akkountlar`,
    intro: `eFootball'da ${label} darajasiga chiqqan akkountlar — ${tone}. Har bir e'londa jamoa kuchi, Android/iOS tangalari va obmen shartlari ko'rsatilgan.`,
    params: { attributes: { highest_division_level: String(level) } },
  };
}

function player(slug: string, displayName: string, playerQuery: string): MarketplaceLandingDef {
  return {
    slug,
    label: displayName,
    title: `${displayName} kartali eFootball akkountlar`,
    description: `${displayName} kartasi bor eFootball akkountlarni bir joyda toping: Epic, Big Time va Show Time kartalar, divizion va narxi bilan. Sotuvchi Telegram'da.`,
    h1: `${displayName} kartali akkountlar`,
    intro: `Sotuvda ${displayName} kartasi biriktirilgan eFootball akkountlar. Karta turi (Epic, Big Time, Show Time), divizion va jamoa kuchi har bir e'londa ko'rsatilgan.`,
    params: {},
    playerQuery,
  };
}

export const MARKETPLACE_LANDINGS: readonly MarketplaceLandingDef[] = [
  division(1),
  division(2),
  division(3),
  division(4),
  {
    slug: 'toza-akkount',
    label: 'Toza akkount',
    title: "Toza eFootball akkountlar — Google Play va Game Center ulanmagan",
    description:
      "Google Play yoki Game Center'ga ulanmagan toza eFootball akkountlar. Konami ID orqali xavfsiz o'tkaziladi — eski egasida kirish qolmaydi.",
    h1: 'Toza eFootball akkountlar',
    intro:
      "Store'ga ulangan link akkountdan olib tashlanmaydi — Konami ID o'tkazilganda eski egasida kirish imkoni qoladi. Shu sabab Google Play va Game Center ulanmagan \"toza\" akkountlar xavfsiz tanlov hisoblanadi.",
    params: {
      attributes: { has_google_play_link: 'false', has_game_center_link: 'false' },
    },
  },
  {
    slug: 'steam',
    label: 'Steam',
    title: 'Steam eFootball akkountlar',
    description:
      "Steam platformasidagi eFootball akkountlar: divizion, jamoa kuchi va narxi ochiq. Sotuvchi bilan Telegram orqali bevosita bog'laning.",
    h1: 'Steam eFootball akkountlar',
    intro:
      "Steam'da o'ynaladigan eFootball akkountlar ro'yxati. Har bir e'londa divizion, jamoa kuchi va obmen shartlari ko'rsatilgan.",
    params: { attributes: { platform: 'STEAM' } },
  },
  {
    slug: 'playstation',
    label: 'PlayStation',
    title: 'PlayStation eFootball akkountlar',
    description:
      "PlayStation'dagi eFootball akkountlar: divizion, jamoa kuchi va narxi ochiq. Sotuvchi bilan Telegram orqali bevosita bog'laning.",
    h1: 'PlayStation eFootball akkountlar',
    intro:
      "PlayStation'da o'ynaladigan eFootball akkountlar ro'yxati. Har bir e'londa divizion, jamoa kuchi va obmen shartlari ko'rsatilgan.",
    params: { attributes: { platform: 'PLAYSTATION' } },
  },
  player('messi', 'Messi', 'Messi'),
  player('ronaldo', 'Ronaldo', 'Ronaldo'),
  player('mbappe', 'Mbappe', 'Mbappe'),
  player('neymar', 'Neymar', 'Neymar'),
  player('haaland', 'Haaland', 'Haaland'),
] as const;

export function getMarketplaceLanding(slug: string): MarketplaceLandingDef | undefined {
  return MARKETPLACE_LANDINGS.find((def) => def.slug === slug);
}
