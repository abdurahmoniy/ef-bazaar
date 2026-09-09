import type { EmojiItem } from '@/lib/emoji-packs';

const RECENTS_KEY = 'ef_recent_custom_emojis';
const MAX_RECENTS = 32;

/**
 * Oxirgi ishlatilgan emojilarni `localStorage` dan xavfsiz o'qiydi.
 */
export function getRecentEmojis(): EmojiItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is EmojiItem =>
      Boolean(item && typeof item === 'object' && item.customEmojiId && item.thumbnailUrl),
    );
  } catch {
    return [];
  }
}

/**
 * Tanlangan emojini oxirgi ishlatilganlar ro'yxatining boshiga qo'shadi.
 *
 * <p>Mavjud nusxasi bo'lsa yuqoriga ko'tariladi (dublikat bo'lmaydi) va
 * umumiy soni {@link MAX_RECENTS} bilan cheklanadi.
 */
export function addRecentEmoji(item: EmojiItem): EmojiItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = getRecentEmojis();
    const filtered = current.filter((r) => r.customEmojiId !== item.customEmojiId);
    const updated = [item, ...filtered].slice(0, MAX_RECENTS);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

/**
 * Tarixni tozalash.
 */
export function clearRecentEmojis(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RECENTS_KEY);
  } catch {
    // Ignore
  }
}
