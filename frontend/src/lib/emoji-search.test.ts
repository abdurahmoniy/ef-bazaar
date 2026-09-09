import { describe, expect, it } from 'vitest';

import type { EmojiPackDetail } from '@/lib/emoji-packs';
import { searchCustomEmojis } from './emoji-search';

const samplePacks: EmojiPackDetail[] = [
  {
    id: 'pack-1',
    setName: 'ParsEPIC26',
    title: '@PES_M @PESPARS',
    items: [
      {
        customEmojiId: 'emoji-1',
        emoji: '⚽',
        format: 'static',
        thumbnailUrl: 'https://efbazaar.uz/1.webp',
        fileUrl: 'https://efbazaar.uz/1.webp',
      },
      {
        customEmojiId: 'emoji-2',
        emoji: '🔥',
        format: 'static',
        thumbnailUrl: 'https://efbazaar.uz/2.webp',
        fileUrl: 'https://efbazaar.uz/2.webp',
      },
      {
        customEmojiId: 'emoji-3',
        emoji: '😂',
        format: 'static',
        thumbnailUrl: 'https://efbazaar.uz/3.webp',
        fileUrl: 'https://efbazaar.uz/3.webp',
      },
      {
        customEmojiId: 'emoji-4',
        emoji: '❤️',
        format: 'static',
        thumbnailUrl: 'https://efbazaar.uz/4.webp',
        fileUrl: 'https://efbazaar.uz/4.webp',
      },
      {
        customEmojiId: 'emoji-5',
        emoji: '👍',
        format: 'static',
        thumbnailUrl: 'https://efbazaar.uz/5.webp',
        fileUrl: 'https://efbazaar.uz/5.webp',
      },
    ],
  },
  {
    id: 'pack-2',
    setName: 'AnimeReactions',
    title: 'Anime Fun',
    items: [
      {
        customEmojiId: 'emoji-6',
        emoji: '😢',
        format: 'static',
        thumbnailUrl: 'https://efbazaar.uz/6.webp',
        fileUrl: 'https://efbazaar.uz/6.webp',
      },
      {
        customEmojiId: 'emoji-7',
        emoji: '💰',
        format: 'static',
        thumbnailUrl: 'https://efbazaar.uz/7.webp',
        fileUrl: 'https://efbazaar.uz/7.webp',
      },
    ],
  },
];

describe('searchCustomEmojis', () => {
  it('asl emoji kiritilganda to`g`ri topadi', () => {
    const results = searchCustomEmojis(samplePacks, '⚽');
    expect(results).toHaveLength(1);
    expect(results[0].customEmojiId).toBe('emoji-1');
  });

  it('o`zbekcha kalit so`z bilan topadi', () => {
    // "kulgi" -> 😂
    const laugh = searchCustomEmojis(samplePacks, 'kulgi');
    expect(laugh.some((e) => e.customEmojiId === 'emoji-3')).toBe(true);

    // "olov" -> 🔥
    const fire = searchCustomEmojis(samplePacks, 'olov');
    expect(fire.some((e) => e.customEmojiId === 'emoji-2')).toBe(true);

    // "yurak" -> ❤️
    const heart = searchCustomEmojis(samplePacks, 'yurak');
    expect(heart.some((e) => e.customEmojiId === 'emoji-4')).toBe(true);

    // "futbol" / "to'p" -> ⚽
    const football = searchCustomEmojis(samplePacks, 'futbol');
    expect(football.some((e) => e.customEmojiId === 'emoji-1')).toBe(true);

    // "pul" -> 💰
    const money = searchCustomEmojis(samplePacks, 'pul');
    expect(money.some((e) => e.customEmojiId === 'emoji-7')).toBe(true);
  });

  it('inglizcha kalit so`z bilan topadi', () => {
    const smile = searchCustomEmojis(samplePacks, 'smile');
    expect(smile.some((e) => e.customEmojiId === 'emoji-3')).toBe(true);

    const heart = searchCustomEmojis(samplePacks, 'love');
    expect(heart.some((e) => e.customEmojiId === 'emoji-4')).toBe(true);
  });

  it('ruscha kalit so`z bilan topadi', () => {
    const fire = searchCustomEmojis(samplePacks, 'огонь');
    expect(fire.some((e) => e.customEmojiId === 'emoji-2')).toBe(true);

    const tears = searchCustomEmojis(samplePacks, 'слезы');
    expect(tears.some((e) => e.customEmojiId === 'emoji-6')).toBe(true);
  });

  it('to`plam nomi bo`yicha qidirganda barcha a`zolarini qaytaradi', () => {
    const pes = searchCustomEmojis(samplePacks, 'ParsEPIC');
    expect(pes.length).toBe(5);
  });

  it('kategoriya filtri to`g`ri ishlaydi', () => {
    const hearts = searchCustomEmojis(samplePacks, '', 'heart');
    expect(hearts).toHaveLength(1);
    expect(hearts[0].customEmojiId).toBe('emoji-4');

    const likes = searchCustomEmojis(samplePacks, '', 'like');
    expect(likes).toHaveLength(1);
    expect(likes[0].customEmojiId).toBe('emoji-5');
  });
});
