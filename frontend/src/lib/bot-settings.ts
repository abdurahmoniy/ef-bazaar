import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import { telegramTextLength } from '@/lib/telegram-html';

/**
 * Banner qo'yilganda amal qiladigan chegara — Telegram rasm izohi.
 *
 * <p>Bu sonlar backend'da ham bor (BotSettingsService). Bu yerdagisi
 * yozayotgan odamga ko'rsatish uchun, u yerdagisi haqiqiy himoya —
 * brauzerdagi tekshiruvni chetlab o'tish mumkin, servisdagisini yo'q.
 */
export const CAPTION_MAX_LENGTH = 1024;

/** Bannersiz oddiy matnli xabar chegarasi. */
export const TEXT_MAX_LENGTH = 4096;

/** Banner holatiga qarab amal qiladigan chegara. */
export function effectiveLimit(withBanner: boolean): number {
  return withBanner ? CAPTION_MAX_LENGTH : TEXT_MAX_LENGTH;
}

export interface BotSettings {
  welcomeText: string;
  bannerFileId: string | null;
  updatedAt: string;
}

/**
 * Telegram teglarni sanamaydi, faqat ko'rinadigan matnni — hisobni xuddi
 * shunday qilamiz, aks holda hisoblagich adminni chalg'itadi.
 */
export const captionLength = telegramTextLength;

async function parseError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.message || payload?.error || `Xatolik (${response.status})`;
  } catch {
    return `Xatolik (${response.status})`;
  }
}

export async function updateBotWelcomeText(welcomeText: string): Promise<BotSettings> {
  const response = await fetch(buildMarketplaceApiPath(['v1', 'admin', 'bot-settings']), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ welcomeText }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function uploadBotBanner(file: File): Promise<BotSettings> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'admin', 'bot-settings', 'banner']),
    { method: 'POST', headers: { Accept: 'application/json' }, credentials: 'include', body: formData },
  );
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function removeBotBanner(): Promise<BotSettings> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'admin', 'bot-settings', 'banner']),
    { method: 'DELETE', headers: { Accept: 'application/json' }, credentials: 'include' },
  );
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}
