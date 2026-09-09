/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';

import type { EmojiItem } from '@/lib/emoji-packs';
import { addRecentEmoji, clearRecentEmojis, getRecentEmojis } from './emoji-recents';

const item1: EmojiItem = {
  customEmojiId: 'e-1',
  emoji: '🔥',
  format: 'static',
  thumbnailUrl: 'https://efbazaar.uz/1.webp',
  fileUrl: 'https://efbazaar.uz/1.webp',
};

const item2: EmojiItem = {
  customEmojiId: 'e-2',
  emoji: '⚽',
  format: 'static',
  thumbnailUrl: 'https://efbazaar.uz/2.webp',
  fileUrl: 'https://efbazaar.uz/2.webp',
};

describe('emoji-recents', () => {
  beforeEach(() => {
    clearRecentEmojis();
  });

  it('boshlang`ich holatda bo`sh massiv qaytaradi', () => {
    expect(getRecentEmojis()).toEqual([]);
  });

  it('yangi emojini boshiga qo`shadi va dublikatlarni yo`qotadi', () => {
    addRecentEmoji(item1);
    addRecentEmoji(item2);
    expect(getRecentEmojis()).toEqual([item2, item1]);

    // item1 yana bosilganda u birinchi o'ringa ko'tariladi
    addRecentEmoji(item1);
    expect(getRecentEmojis()).toEqual([item1, item2]);
  });
});
