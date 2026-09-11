'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Trash2, Upload, Video, Tag } from 'lucide-react';

import {
  createGuide,
  deleteGuide,
  listGuides,
  updateGuideCategory,
  resolveGuideCategory,
  MAX_VIDEO_BYTES,
  type Guide,
} from '@/lib/guides';
import { HELP_CATEGORIES } from '@/lib/help-data';

const GUIDE_CATEGORY_OPTIONS = HELP_CATEGORIES.filter((c) => c.id !== 'all');

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Adminka "Qo'llanmalar" bo'limi.
 *
 * <p>Video Telegram'ga yuklanadi va bizda faqat `file_id` qoladi — shu
 * sababli qo'llanma bir marta yuklanib, keyin har safar oniy yuboriladi.
 */
export function AdminGuides() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('start');
  const [video, setVideo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      setGuides(await listGuides());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ro`yxatni olishda xato');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function pickVideo(file: File | null) {
    setError(null);
    if (file && file.size > MAX_VIDEO_BYTES) {
      // Yuklashdan OLDIN aytamiz: 200 MB lik faylni tarmoqqa chiqarib,
      // keyin rad etish adminning bir necha daqiqasini yeydi.
      setError(`Video ${megabytes(file.size)} — Telegram boti 50 MB gacha qabul qiladi.`);
      setVideo(null);
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    setVideo(file);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !description.trim() || !video || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await createGuide(title.trim(), description.trim(), video, category);
      setTitle('');
      setDescription('');
      setCategory('start');
      setVideo(null);
      if (fileInput.current) fileInput.current.value = '';
      setNotice(`"${saved.title}" saqlandi (${saved.category || category} toifasida)`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saqlashda xato');
    } finally {
      setSaving(false);
    }
  }

  async function changeCategory(guide: Guide, newCategory: string) {
    setUpdatingId(guide.id);
    setError(null);
    setNotice(null);
    try {
      await updateGuideCategory(guide.id, newCategory);
      setNotice(`"${guide.title}" toifasi yangilandi`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toifani yangilashda xato');
    } finally {
      setUpdatingId(null);
    }
  }

  async function remove(guide: Guide) {
    if (!window.confirm(`"${guide.title}" qo'llanmasi o'chirilsinmi?`)) return;
    setError(null);
    try {
      await deleteGuide(guide.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'O`chirishda xato');
    }
  }

  const ready = title.trim() && description.trim() && video && !saving;

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Video className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Qo&apos;llanmalar</h1>
          <p className="text-sm text-muted-foreground">
            Video qo&apos;llanmalar. Saytdagi Yordam markazi (/help) va Telegram botdagi tugmalar shu ro&apos;yxatdan olinadi.
          </p>
        </div>
      </header>

      <form onSubmit={submit} className="space-y-3 rounded-lg border border-border p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="guide-title" className="text-sm font-semibold">Sarlavha</label>
            <input
              id="guide-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="E'lon qanday joylanadi"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="guide-category" className="text-sm font-semibold">Toifa (Bo‘lim)</label>
            <select
              id="guide-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {GUIDE_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} ({opt.shortLabel})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="guide-description" className="text-sm font-semibold">
            Tavsif
          </label>
          <textarea
            id="guide-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Video bilan birga chiqadigan matn"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <p className="text-xs text-muted-foreground">
            Bu matn saytda va botda video bilan birga foydalanuvchiga ko&apos;rsatiladi.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="guide-video" className="text-sm font-semibold">Video</label>
          <input
            id="guide-video"
            ref={fileInput}
            type="file"
            accept="video/*"
            onChange={(e) => pickVideo(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm"
          />
          <p className="text-xs text-muted-foreground">
            50 MB gacha, <b>MP4</b> tavsiya etiladi. Telegram bot orqali
            yuklangan videoni QAYTA KODLAMAYDI — ilovadagi siqish faqat odam
            yuborganda ishlaydi. Boshqa formatlar (masalan <code>.MOV</code>)
            o&apos;ynatiladigan video emas, oddiy fayl bo&apos;lib chiqishi mumkin.
          </p>
        </div>

        <button
          type="submit"
          disabled={!ready}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {saving ? 'Yuklanmoqda…' : 'Saqlash'}
        </button>
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
      ) : guides.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <Video className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Hali qo&apos;llanma yo&apos;q.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
            <span>Mavjud video qo&apos;llanmalar ({guides.length} ta)</span>
            <span>Toifani o&apos;zgartirish imkoniyati mavjud</span>
          </div>

          <ul className="space-y-2">
            {guides.map((guide) => {
              const currentCategory = resolveGuideCategory(guide);
              return (
                <li
                  key={guide.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{guide.title}</p>
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                        <Tag className="h-3 w-3" />
                        {GUIDE_CATEGORY_OPTIONS.find((c) => c.id === currentCategory)?.shortLabel || currentCategory}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground line-clamp-2">
                      {guide.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={guide.category || currentCategory}
                      disabled={updatingId === guide.id}
                      onChange={(e) => void changeCategory(guide, e.target.value)}
                      aria-label={`${guide.title} toifasini o'zgartirish`}
                      className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground outline-none focus:border-primary disabled:opacity-50"
                    >
                      {GUIDE_CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.shortLabel}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => void remove(guide)}
                      aria-label={`${guide.title} qo'llanmasini o'chirish`}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
