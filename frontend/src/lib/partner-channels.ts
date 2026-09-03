import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

export interface ChannelCard {
  channelId: string;
  title: string;
  username: string | null;
  photoUrl: string | null;
  subscriberCount: number;
  priceSom: number;
}

/**
 * Tanlangan kanallarning umumiy summasi.
 *
 * <p>Ro'yxatda yo'q tanlov E'TIBORGA OLINMAYDI: qidiruv o'zgarganda
 * tanlangan kanal ekrandan chiqib ketishi mumkin, va o'shanda jami
 * summa undan qulamasligi kerak.
 */
export function totalPrice(channels: ChannelCard[], selectedIds: string[]): number {
  const byId = new Map(channels.map((c) => [c.channelId, c.priceSom]));
  return selectedIds.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0);
}

export function toggleChannel(selected: string[], channelId: string): string[] {
  return selected.includes(channelId)
    ? selected.filter((id) => id !== channelId)
    : [...selected, channelId];
}

export function formatSubscribers(count: number): string {
  return count.toLocaleString('uz-UZ');
}

/** Rasm yo'q bo'lsa nom bosh harfi — buzuq rasm o'rniga. */
export function channelInitial(title: string): string {
  const trimmed = title.trim();
  return trimmed ? trimmed[0].toUpperCase() : '#';
}

export async function searchChannels(query: string): Promise<ChannelCard[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());

  const response = await fetch(buildMarketplaceApiPath(['v1', 'partners', 'channels'], params), {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Kanallar yuklanmadi');
  return response.json();
}
