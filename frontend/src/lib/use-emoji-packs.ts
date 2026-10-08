'use client';

import { useEffect, useMemo, useState } from 'react';

import { getEmojiPack, listEmojiPacks, type EmojiPackDetail } from '@/lib/emoji-packs';

interface LoadedEmojiPacks {
  packs: EmojiPackDetail[];
  /** Muharrir uchun: id → statik thumbnail. */
  thumbnailUrls: ReadonlyMap<string, string>;
  /** Preview uchun: id → asl fayl, harakatlanib ko'rinadigani. */
  fileUrls: ReadonlyMap<string, string>;
  loading: boolean;
  error: string | null;
}

/**
 * Qo'shilgan emoji to'plamlarini bir marta yuklaydi.
 *
 * <p>Ikkita xarita qaytadi va bu ataylab: muharrirda statik rasm turadi
 * (matn ichida o'nlab emoji bo'lishi mumkin), preview'da esa asl fayl —
 * admin xabar qanday chiqishini haqiqiy holicha ko'rishi kerak.
 *
 * Loading failures are exposed to the picker without blocking message text.
 */
export function useEmojiPacks(scope: 'admin' | 'chat' = 'admin'): LoadedEmojiPacks {
  const [packs, setPacks] = useState<EmojiPackDetail[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summaries = await listEmojiPacks(scope);
        const details = await Promise.all(summaries.map((s) => getEmojiPack(s.id, scope)));
        if (!cancelled) setPacks(details);
      } catch {
        if (!cancelled) setError('Emoji to‘plamlarini yuklab bo‘lmadi.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return useMemo(() => {
    const thumbnailUrls = new Map<string, string>();
    const fileUrls = new Map<string, string>();
    for (const pack of packs) {
      for (const item of pack.items) {
        thumbnailUrls.set(item.customEmojiId, item.thumbnailUrl);
        fileUrls.set(item.customEmojiId, item.fileUrl);
      }
    }
    return { packs, thumbnailUrls, fileUrls, loading, error };
  }, [packs, loading, error]);
}
