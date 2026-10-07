import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

export interface EmojiPackSummary {
  id: string;
  setName: string;
  title: string;
  count: number;
  addedAt: string;
  refreshedAt: string | null;
}

export interface EmojiItem {
  customEmojiId: string;
  /** Zaxira emoji — custom emoji ko'rsatib bo'lmasa shu chiqadi. */
  emoji: string;
  /** video (.webm) | animated (.tgs) | static (.webp) */
  format: string;
  /** Panel uchun statik variant. */
  thumbnailUrl: string;
  /** Preview uchun asl fayl — harakatlanib ko'rinadigani. */
  fileUrl: string;
}

export interface EmojiPackDetail {
  id: string;
  setName: string;
  title: string;
  items: EmojiItem[];
}

/**
 * Emoji qaysi HTML elementi bilan chiziladi.
 *
 * <p>`video` — `.webm`, `<video>` kerak. `animated` — `.tgs`, ya'ni gzip
 * qilingan Lottie: brauzer uni o'zi chiza olmaydi, shuning uchun panelda
 * faqat statik thumbnail ko'rsatiladi. Qolgani oddiy rasm.
 *
 * <p>Noto'g'ri element tanlansa katak jimgina bo'sh qoladi — brauzer
 * `<img src="...webm">` uchun xato bermaydi, shunchaki hech narsa
 * chizmaydi.
 */
export function emojiElementKind(format: string, animated: boolean): 'video' | 'image' {
  if (!animated) return 'image';
  return format === 'video' ? 'video' : 'image';
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.message || payload?.error || `Xatolik (${response.status})`;
  } catch {
    return `Xatolik (${response.status})`;
  }
}

function packsPath(...segments: string[]): string {
  return buildMarketplaceApiPath(['v1', 'admin', 'emoji-packs', ...segments]);
}

export async function listEmojiPacks(scope: 'admin' | 'chat' = 'admin'): Promise<EmojiPackSummary[]> {
  const response = await fetch(scope === 'admin' ? packsPath() : buildMarketplaceApiPath(['v1', 'emoji-packs']), {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function getEmojiPack(id: string, scope: 'admin' | 'chat' = 'admin'): Promise<EmojiPackDetail> {
  const response = await fetch(scope === 'admin' ? packsPath(id) : buildMarketplaceApiPath(['v1', 'emoji-packs', id]), {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function addEmojiPack(link: string): Promise<EmojiPackSummary> {
  const response = await fetch(packsPath(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ link }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function deleteEmojiPack(id: string): Promise<void> {
  const response = await fetch(packsPath(id), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(await parseError(response));
}
