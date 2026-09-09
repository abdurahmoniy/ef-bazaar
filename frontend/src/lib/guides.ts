import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

export interface Guide {
  id: string;
  title: string;
  description: string;
  videoFileId: string;
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

async function parseError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.message || payload?.error || `Xatolik (${response.status})`;
  } catch {
    return `Xatolik (${response.status})`;
  }
}

function path(...segments: string[]): string {
  return buildMarketplaceApiPath(['v1', 'admin', 'guides', ...segments]);
}

export async function listGuides(): Promise<Guide[]> {
  const response = await fetch(path(), {
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
): Promise<Guide> {
  const form = new FormData();
  form.append('title', title);
  form.append('description', description);
  form.append('video', video);

  // Content-Type ATAYLAB qo'yilmaydi: brauzer uni multipart boundary
  // bilan o'zi yozadi va qo'lda yozilsa boundary yo'qolib, backend
  // faylni umuman ko'rmaydi.
  const response = await fetch(path(), {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    body: form,
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function deleteGuide(id: string): Promise<void> {
  const response = await fetch(path(id), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(await parseError(response));
}

export async function listGuideButtons(): Promise<GuideButton[]> {
  const response = await fetch(path('buttons'), {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function saveGuideButtons(buttons: GuideButtonDraft[]): Promise<GuideButton[]> {
  const response = await fetch(path('buttons'), {
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
