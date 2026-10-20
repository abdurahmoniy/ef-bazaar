import { parsePlayerMatchValues, writePlayerMatch } from './player-match-query';

/** Saved searches v1 deliberately include only player cards and prices (som). */
export interface SavedSearchCriteria {
  matchCard: string[];
  matchStrictness: number;
  minPrice: number | null;
  maxPrice: number | null;
}
export function savedSearchFromQuery(query: URLSearchParams): SavedSearchCriteria {
  const price = (key: string) => {
    const raw = query.get(key);
    if (raw === null || raw === '') return null;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('Narxni butun so‘mda kiriting');
    return Number(raw);
  };
  const minPrice = price('minPrice');
  const maxPrice = price('maxPrice');
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) throw new Error('Eng kam narx eng yuqori narxdan oshmasin');
  const match = parsePlayerMatchValues(query.getAll('matchCard'), query.get('matchStrictness') ?? undefined);
  if (!match.criteria.length && minPrice === null && maxPrice === null) throw new Error('Avval o‘yinchi kartalari yoki narx oralig‘ini tanlang');
  return {
    matchCard: match.criteria.map(card => `${card.efhubId}:${card.playerId}:${card.importance}`),
    matchStrictness: match.strictness, minPrice, maxPrice,
  };
}
export function savedSearchHref(criteria: SavedSearchCriteria): string {
  const match = parsePlayerMatchValues(criteria.matchCard, String(criteria.matchStrictness));
  const query = writePlayerMatch(new URLSearchParams(), match);
  if (criteria.minPrice !== null) query.set('minPrice', String(criteria.minPrice));
  if (criteria.maxPrice !== null) query.set('maxPrice', String(criteria.maxPrice));
  return `/marketplace?${query}`;
}
export function watchErrorMessage(status: number, payload: unknown): string {
  const body = (payload ?? {}) as { code?: string; message?: string };
  if (status === 401 || status === 403) return 'Kirish yoki bu kuzatuvga ruxsat talab qilinadi';
  if (status === 503 || body.code?.includes('not_ready')) return 'Tarif yoki kuzatuv xizmati hali tayyor emas. Qayta urinib ko‘ring.';
  if (body.code?.includes('limit') || body.code?.includes('quota')) return 'Joriy tarifdagi kuzatuv limiti band. Mavjud kuzatuvni tahrirlang/o‘chiring yoki Pro tarifini ko‘ring.';
  if (status === 404) return 'Kuzatuv yoki e’lon topilmadi. Ro‘yxatni yangilang.';
  return body.message || 'So‘rov bajarilmadi. Qayta urinib ko‘ring.';
}

export type WatchKind = 'search' | 'price';
export interface WatchRow {
  id: string;
  paused: boolean;
  pauseReason: 'USER' | 'LIMIT' | 'UNAVAILABLE' | null;
  priority: number;
  createdAt: string;
}
export interface SavedSearch extends WatchRow, SavedSearchCriteria {
  name: string;
  notificationsEnabled: boolean;
}
export interface PriceWatch extends WatchRow { listingId: string; }
export interface WatchList<T> {
  items: T[];
  limit: number | null;
  immediate: boolean;
  available: boolean;
}
export interface PriceWatchList extends WatchList<PriceWatch> {
  notificationsEnabled: boolean;
  telegramEnabled: boolean;
}
