import type { CampaignInput } from './types';
export const UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const uuid = new RegExp(`^${UUID_PATTERN}$`);
export function isSafePopupPath(path: string): boolean {
  return ['/marketplace', '/profile', '/help', '/invite', '/notifications', '/marketplace/new', '/blacklist', '/profile?tab=accounts', '/profile?tab=favorites'].includes(path)
    || new RegExp(`^/marketplace/${UUID_PATTERN}$`).test(path)
    || /^\/help\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path);
}
export function validateCampaign(value: CampaignInput): string | null {
  if (!value.title.trim() || value.title.trim().length > 100) return 'Sarlavha 1–100 ta belgidan iborat bo‘lsin.';
  if (!value.message.trim() || value.message.trim().length > 600) return 'Xabar 1–600 ta belgidan iborat bo‘lsin.';
  if (!['INFO', 'SUCCESS', 'WARNING'].includes(value.tone) || !['ALL', 'SELLERS', 'SELECTED'].includes(value.audience)
    || !['BROWSE', 'LISTING_PUBLISHED', 'EMPTY_SEARCH', 'TRADE_COMPLETED'].includes(value.trigger)) return 'Xabar sozlamalarini tekshiring.';
  if (value.audience === 'SELECTED' && (!value.recipientIds.length || value.recipientIds.length > 100 || value.recipientIds.some(id => !uuid.test(id)))) return '1–100 ta to‘g‘ri foydalanuvchi UUID kiriting.';
  const label = value.actionLabel?.trim() ?? ''; const path = value.actionPath?.trim() ?? '';
  if (Boolean(label) !== Boolean(path) || label.length > 60 || (path && !isSafePopupPath(path))) return 'Tugma nomi va ruxsat etilgan ichki manzilni birga kiriting.';
  const start = Date.parse(value.startsAt); const end = Date.parse(value.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 30*86400_000) return 'Tugash vaqti boshlanishdan keyin, 30 kun ichida bo‘lsin.';
  if (!Number.isInteger(value.priority) || value.priority < 0 || value.priority > 10) return 'Ustuvorlik 0–10 oralig‘ida bo‘lsin.';
  return null;
}
