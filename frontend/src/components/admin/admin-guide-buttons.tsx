'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';

import {
  buttonsAreValid,
  BUTTON_LABEL_MAX,
  listGuideButtons,
  listGuides,
  saveGuideButtons,
  type Guide,
  type GuideButtonDraft,
} from '@/lib/guides';

/**
 * Bot → Qo'llanmalar tabi: qaysi tugmalar `/start` dan keyin chiqadi.
 *
 * <p>Ro'yxat BUTUNLAY almashtiriladi. Tugmalar tartibi ma'noga ega va uni
 * bittalab saqlash bilan boshqarish qiyin bo'lardi: har qo'shishda tartib
 * raqamlarini qayta hisoblash kerak. Bu yerda ko'rgan tartib botda ham
 * shunday chiqadi.
 */
export function AdminGuideButtons() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [buttons, setButtons] = useState<GuideButtonDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [allGuides, saved] = await Promise.all([listGuides(), listGuideButtons()]);
      setGuides(allGuides);
      setButtons(saved.map((b) => ({ label: b.label, guideId: b.guideId })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yuklashda xato');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update(index: number, patch: Partial<GuideButtonDraft>) {
    setButtons((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setNotice(null);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveGuideButtons(buttons);
      setNotice(
        buttons.length === 0
          ? "Tugmalar olib tashlandi — /start dan keyin qo'llanmalar xabari chiqmaydi"
          : `${buttons.length} ta tugma saqlandi`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saqlashda xato');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
      </p>
    );
  }

  if (guides.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Avval <b>Qo&apos;llanmalar</b> bo&apos;limida video qo&apos;shing — tugma
          o&apos;shalardan birini ochadi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Bu tugmalar <code>/start</code> dan keyin alohida xabarda chiqadi. Kamida bitta
        tugma bo&apos;lmasa, o&apos;sha xabar umuman yuborilmaydi.
      </p>

      <ul className="space-y-2">
        {buttons.map((button, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <li key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
            <input
              value={button.label}
              maxLength={BUTTON_LABEL_MAX}
              onChange={(e) => update(index, { label: e.target.value })}
              placeholder="Tugma yozuvi"
              aria-label={`${index + 1}-tugma yozuvi`}
              className="min-w-40 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={button.guideId}
              onChange={(e) => update(index, { guideId: e.target.value })}
              aria-label={`${index + 1}-tugma qo'llanmasi`}
              className="min-w-48 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Qo&apos;llanmani tanlang</option>
              {guides.map((guide) => (
                <option key={guide.id} value={guide.id}>{guide.title}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setButtons((rows) => rows.filter((_, i) => i !== index))}
              aria-label={`${index + 1}-tugmani olib tashlash`}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setButtons((rows) => [...rows, { label: '', guideId: '' }])}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" /> Tugma qo&apos;shish
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !buttonsAreValid(buttons)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Saqlash
        </button>
      </div>

      {!buttonsAreValid(buttons) && (
        <p className="text-xs text-muted-foreground">
          Har tugmada yozuv ham, tanlangan qo&apos;llanma ham bo&apos;lishi kerak.
        </p>
      )}
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
    </div>
  );
}
