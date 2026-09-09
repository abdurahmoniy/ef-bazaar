import { describe, expect, it } from 'vitest';

import { emojiElementKind } from '@/lib/emoji-packs';

describe('emojiElementKind', () => {
  it('panelda hamma narsa rasm sifatida chiziladi', () => {
    // Panelda 200 ta emoji birdan turadi. Videoni o'ynatsak brauzer
    // bo'g'iladi, shuning uchun u yerda faqat statik thumbnail.
    expect(emojiElementKind('video', false)).toBe('image');
    expect(emojiElementKind('animated', false)).toBe('image');
    expect(emojiElementKind('static', false)).toBe('image');
  });

  it('harakatli joyda faqat video formatga video elementi beriladi', () => {
    expect(emojiElementKind('video', true)).toBe('video');
  });

  it('tgs brauzer chiza olmaydigan format — rasm bilan qoladi', () => {
    // .tgs gzip qilingan Lottie JSON. <video> ga bersak katak jimgina
    // bo'sh qolardi: brauzer xato bermaydi, shunchaki hech narsa chizmaydi.
    expect(emojiElementKind('animated', true)).toBe('image');
    expect(emojiElementKind('static', true)).toBe('image');
  });
});
