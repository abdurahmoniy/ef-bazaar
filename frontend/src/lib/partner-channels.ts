import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import { listingMediaUrl } from '@/lib/marketplace-media';

export interface ChannelCard {
  channelId: string;
  title: string;
  username: string | null;
  photoFileId: string | null;
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

/**
 * Kanal avatarining manzili.
 *
 * <p>E'lon rasmlari bilan AYNAN BIR XIL proksi ({@code /bot/photo/...}).
 * Ikkinchi mexanizm qurilmadi — u bir xil narsani ikki joyda tuzatishga
 * majbur qilardi.
 */
export function channelPhotoUrl(channel: Pick<ChannelCard, 'photoFileId'>): string | null {
  return channel.photoFileId ? listingMediaUrl(channel.photoFileId) : null;
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

// ---------- mavjud e'lonni kanallarga joylash ----------

export interface PostedChannel {
  channelId: string;
  channelTitle: string;
  postedCount: number;
  lastPostedAt: string | null;
  channelActive: boolean;
  currentPriceSom: number;
}

/**
 * E'lon qaysi kanallarda, necha marta chiqqan.
 *
 * <p>Qayta yuborishdan oldin ko'rsatiladi: kanalda e'lonlar tez
 * aylanadi va "qachon chiqqan edi" degan savolga javobsiz qayta
 * to'lash qorong'ida qaror qabul qilish bo'lardi.
 */
export async function listPostedChannels(listingId: string): Promise<PostedChannel[]> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'listings', listingId, 'channel-posts']),
    { headers: { Accept: 'application/json' }, credentials: 'include' },
  );
  if (!response.ok) throw new Error('Kanallar ro‘yxati yuklanmadi');
  return response.json();
}

export async function orderChannelPosts(listingId: string, channelIds: string[]): Promise<void> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'listings', listingId, 'channel-posts']),
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ channelIds }),
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? 'Kanallarga joylab bo‘lmadi');
  }
}

/**
 * "3 kun oldin" ko'rinishidagi qisqa sana.
 *
 * <p>Aniq sana emas: sotuvchiga kerakli narsa "yaqindami yoki
 * ko'mildimi" degan hukm, kalendar sanasi emas.
 */
export function postedAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'hali chiqmagan';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'hali chiqmagan';
  const days = Math.floor((now.getTime() - then) / 86_400_000);
  if (days <= 0) return 'bugun';
  if (days === 1) return 'kecha';
  return days + ' kun oldin';
}
