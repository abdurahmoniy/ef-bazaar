import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import type { HelpCategory } from '@/lib/help-data';

export interface Guide {
  id: string;
  title: string;
  description: string;
  videoFileId: string;
  mediaKind?: 'VIDEO' | 'DOCUMENT' | string;
  category?: string;
  createdAt: string;
}

export interface GuideButton {
  id: string;
  label: string;
  guideId: string;
  guideTitle: string;
}

/** Tugmani saqlashga yuborishdan oldingi shakli — id hali yo'q. */
export interface GuideButtonDraft {
  label: string;
  guideId: string;
}

/**
 * Telegram boti orqali 50 MB dan kattasini yubora olmaydi.
 *
 * <p>Chegara backend'da ham bor — bu yerdagisi yuklashdan OLDIN aytish
 * uchun: 200 MB lik faylni tarmoqqa chiqarib, keyin rad etish adminning
 * bir necha daqiqasini yeydi.
 */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export const BUTTON_LABEL_MAX = 64;

export const VALID_GUIDE_CATEGORIES: ReadonlySet<string> = new Set([
  'start',
  'safety',
  'buyer',
  'seller',
  'wallet',
  'faq',
]);

const BOT_VIDEO_BASE_PATH =
  process.env.NEXT_PUBLIC_BOT_VIDEO_BASE_URL || '/api/video';

export function guideVideoUrl(fileId: string): string {
  const normalized = fileId.trim();
  if (!normalized) return '';
  return `${BOT_VIDEO_BASE_PATH}/${encodeURIComponent(normalized)}`;
}

/**
 * Qo'llanma toifasini aniqlaydi.
 *
 * Agar qo'llanmada toifa ko'rsatilgan bo'lsa (yoki yangilangan bo'lsa), o'shani oladi.
 * Agar eski qo'llanmalarda toifa bo'sh bo'lsa yoki noto'g'ri bo'lsa, sarlavha va
 * tavsifdagi kalit so'zlar bo'yicha aqlli moslashtiradi (fallback heuristic).
 */
export function resolveGuideCategory(
  guide: Pick<Guide, 'title' | 'description'> & { category?: string | null },
): Exclude<HelpCategory, 'all'> {
  if (guide.category && VALID_GUIDE_CATEGORIES.has(guide.category)) {
    return guide.category as Exclude<HelpCategory, 'all'>;
  }

  const text = `${guide.title} ${guide.description}`.toLowerCase();

  if (/garov|xavfsiz|escrow|scam|firibgar|admin|himoya|kafolat|konami/i.test(text)) {
    return 'safety';
  }
  if (/e['‘`’]lon|joylash|sotish|sotuvchi|narx|narxlash|obmen/i.test(text)) {
    return 'seller';
  }
  if (/hamyon|to['‘`’]lov|pul yechish|toldirish|balans|uzcard|humo/i.test(text)) {
    return 'wallet';
  }
  if (/qidiruv|topish|xarid|sotib olish|xaridor|filtr/i.test(text)) {
    return 'buyer';
  }
  if (/savol|faq|javob|nima uchun/i.test(text)) {
    return 'faq';
  }

  return 'start';
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.message || payload?.error || `Xatolik (${response.status})`;
  } catch {
    return `Xatolik (${response.status})`;
  }
}

function adminPath(...segments: string[]): string {
  return buildMarketplaceApiPath(['v1', 'admin', 'guides', ...segments]);
}

/**
 * Public video qo'llanmalar ro'yxati — Yordam markazi (/help) uchun.
 */
export async function listPublicGuides(category?: string): Promise<Guide[]> {
  const query = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
  const response = await fetch(buildMarketplaceApiPath(['v1', 'guides']) + query, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function listGuides(): Promise<Guide[]> {
  const response = await fetch(adminPath(), {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function createGuide(
  title: string,
  description: string,
  video: File,
  category: string = 'start',
): Promise<Guide> {
  const form = new FormData();
  form.append('title', title);
  form.append('description', description);
  form.append('category', category);
  form.append('video', video);

  // Content-Type ATAYLAB qo'yilmaydi: brauzer uni multipart boundary
  // bilan o'zi yozadi va qo'lda yozilsa boundary yo'qolib, backend
  // faylni umuman ko'rmaydi.
  const response = await fetch(adminPath(), {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    body: form,
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function updateGuideCategory(id: string, category: string): Promise<Guide> {
  const response = await fetch(adminPath(id, 'category'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ category }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function deleteGuide(id: string): Promise<void> {
  const response = await fetch(adminPath(id), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(await parseError(response));
}

export async function listGuideButtons(): Promise<GuideButton[]> {
  const response = await fetch(adminPath('buttons'), {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function saveGuideButtons(buttons: GuideButtonDraft[]): Promise<GuideButton[]> {
  const response = await fetch(adminPath('buttons'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ buttons }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

/**
 * Saqlashga tayyormi.
 *
 * <p>Yozuvsiz yoki qo'llanmasiz tugma botda bo'sh katak bo'lib chiqardi
 * va bosilganda hech narsa qilmasdi.
 */
export function buttonsAreValid(buttons: GuideButtonDraft[]): boolean {
  return buttons.every(
    (b) => b.label.trim().length > 0
      && b.label.trim().length <= BUTTON_LABEL_MAX
      && b.guideId.length > 0,
  );
}
