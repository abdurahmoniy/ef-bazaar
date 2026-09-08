'use client';

import { useEffect, useMemo, useState } from 'react';

import { getEmojiPack, listEmojiPacks, type EmojiPackDetail } from '@/lib/emoji-packs';

interface LoadedEmojiPacks {
  packs: EmojiPackDetail[];
  /** Muharrir uchun: id → statik thumbnail. */
  thumbnailUrls: ReadonlyMap<string, string>;
  /** Preview uchun: id → asl fayl, harakatlanib ko'rinadigani. */
  fileUrls: ReadonlyMap<string, string>;
}

/**
 * Qo'shilgan emoji to'plamlarini bir marta yuklaydi.
 *
 * <p>Ikkita xarita qaytadi va bu ataylab: muharrirda statik rasm turadi
 * (matn ichida o'nlab emoji bo'lishi mumkin), preview'da esa asl fayl —
 * admin xabar qanday chiqishini haqiqiy holicha ko'rishi kerak.
 *
 * <p>Xato jimgina yutiladi: emoji to'plami yuklanmagani xabar yozishga
 * to'sqinlik qilmasligi kerak. Panel shunchaki ochilmaydi.
 */
export function useEmojiPacks(): LoadedEmojiPacks {
  const [packs, setPacks] = useState<EmojiPackDetail[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summaries = await listEmojiPacks();
        const details = await Promise.all(summaries.map((s) => getEmojiPack(s.id)));
        if (!cancelled) setPacks(details);
      } catch {
        // Panel bo'sh qoladi — xabar yozish davom etadi.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const thumbnailUrls = new Map<string, string>();
    const fileUrls = new Map<string, string>();
    for (const pack of packs) {
      for (const item of pack.items) {
        thumbnailUrls.set(item.customEmojiId, item.thumbnailUrl);
        fileUrls.set(item.customEmojiId, item.fileUrl);
      }
    }
    return { packs, thumbnailUrls, fileUrls };
  }, [packs]);
}
