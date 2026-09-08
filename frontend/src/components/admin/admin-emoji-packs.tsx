'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Smile, Trash2 } from 'lucide-react';

import {
  addEmojiPack,
  deleteEmojiPack,
  getEmojiPack,
  listEmojiPacks,
  type EmojiPackDetail,
  type EmojiPackSummary,
} from '@/lib/emoji-packs';
import { cn } from '@/lib/utils';

/**
 * Bot → Emoji tabi: Telegram custom emoji to'plamlari.
 *
 * <p>Paneldagi har bir katak — statik thumbnail, video emas. To'plamda 200
 * gacha emoji bo'ladi va ularni birdan o'ynatish brauzerni bo'g'adi.
 * Harakatlanib ko'rinishi preview'da bo'ladi (keyingi bosqich).
 *
 * <p>Emoji ro'yxati to'plam ochilganda yuklanadi, ro'yxat bilan birga emas:
 * uchta to'plam bo'lsa bu 600 ta rasm degani va admin ularning ko'pini
 * ochmaydi ham.
 */
export function AdminEmojiPacks() {
  const [packs, setPacks] = useState<EmojiPackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmojiPackDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const reload = useCallback(async () => {
    try {
      setPacks(await listEmojiPacks());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ro`yxatni olishda xato');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!link.trim() || adding) return;
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await addEmojiPack(link.trim());
      setLink('');
      setNotice(`"${saved.title}" qo'shildi — ${saved.count} ta emoji`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Qo`shishda xato');
    } finally {
      setAdding(false);
    }
  }

  async function toggle(pack: EmojiPackSummary) {
    if (openId === pack.id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(pack.id);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await getEmojiPack(pack.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'To`plamni ochishda xato');
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function remove(pack: EmojiPackSummary) {
    if (!window.confirm(`"${pack.title}" to'plami o'chirilsinmi?`)) return;
    setError(null);
    try {
      await deleteEmojiPack(pack.id);
      if (openId === pack.id) {
        setOpenId(null);
        setDetail(null);
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'O`chirishda xato');
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-2">
        <label htmlFor="emoji-link" className="block text-sm font-semibold">
          Emoji to&apos;plami qo&apos;shish
        </label>
        <div className="flex gap-2">
          <input
            id="emoji-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://t.me/addemoji/MixAnimeEmoji"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!link.trim() || adding}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Qo&apos;shish
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Telegram&apos;dagi to&apos;plamni oching va ulashish havolasini shu yerga qo&apos;ying.
          Mavjud to&apos;plamni qayta qo&apos;shsangiz ro&apos;yxati yangilanadi.
        </p>
      </form>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
        </p>
      ) : packs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <Smile className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Hali to&apos;plam qo&apos;shilmagan.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {packs.map((pack) => (
            <li key={pack.id} className="rounded-lg border border-border">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => void toggle(pack)}
                  aria-expanded={openId === pack.id}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold">{pack.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {pack.setName} · {pack.count} ta
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void remove(pack)}
                  aria-label={`${pack.title} to'plamini o'chirish`}
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {openId === pack.id && (
                <div className="border-t border-border p-3">
                  {detailLoading ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Ochilmoqda…
                    </p>
                  ) : (
                    <div className="grid max-h-80 grid-cols-8 gap-1 overflow-y-auto sm:grid-cols-10">
                      {detail?.items.map((item) => (
                        <span
                          key={item.customEmojiId}
                          title={item.emoji}
                          className={cn(
                            'flex aspect-square items-center justify-center rounded p-1',
                            'transition hover:bg-muted',
                          )}
                        >
                          {/*
                            Statik thumbnail, video emas — bu yerda 200 ta
                            katak bo'lishi mumkin. Yuklash dangasa: ekrandan
                            tashqaridagilar so'ralmaydi.
                          */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.thumbnailUrl}
                            alt={item.emoji}
                            loading="lazy"
                            className="h-full w-full object-contain"
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
