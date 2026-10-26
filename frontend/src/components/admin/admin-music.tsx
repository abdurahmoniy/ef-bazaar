'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Loader2, Music2, Pencil, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createMusicTrack,
  deleteMusicTrack,
  listAdminMusicTracks,
  musicVideoUrl,
  updateMusicTrack,
  type MusicTrack,
} from '@/lib/music';

const EMPTY_DRAFT = { title: '', artist: '', youtubeUrl: '', sortOrder: '0', enabled: true };

export function AdminMusic() {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setTracks(await listAdminMusicTracks());
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Musiqalar ro‘yxatini yuklab bo‘lmadi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const busy = saving || deletingId !== null || loading;
  const sortOrder = Number(draft.sortOrder);
  const valid = draft.title.trim().length > 0 && draft.title.trim().length <= 120
    && draft.artist.trim().length <= 120 && draft.youtubeUrl.trim().length > 0
    && draft.sortOrder.trim().length > 0 && Number.isInteger(sortOrder) && sortOrder >= 0 && sortOrder <= 10000;

  function resetDraft() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  function edit(track: MusicTrack) {
    setEditingId(track.id);
    setDraft({
      title: track.title,
      artist: track.artist,
      youtubeUrl: musicVideoUrl(track.youtubeVideoId),
      sortOrder: String(track.sortOrder),
      enabled: track.enabled,
    });
    setError(null);
    setNotice(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const input = {
      title: draft.title.trim(),
      artist: draft.artist.trim(),
      youtubeUrl: draft.youtubeUrl.trim(),
      sortOrder,
      enabled: draft.enabled,
    };
    try {
      const saved = editingId
        ? await updateMusicTrack(editingId, input)
        : await createMusicTrack(input);
      resetDraft();
      setNotice(`“${saved.title}” saqlandi.`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Musiqani saqlab bo‘lmadi.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(track: MusicTrack) {
    if (busy || !window.confirm(`“${track.title}” musiqasi o‘chirilsinmi?`)) return;
    setDeletingId(track.id);
    setError(null);
    setNotice(null);
    try {
      await deleteMusicTrack(track.id);
      if (editingId === track.id) resetDraft();
      setNotice(`“${track.title}” o‘chirildi.`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Musiqani o‘chirib bo‘lmadi.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary">
          <Music2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Fon musiqasi</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            YouTube havolalari orqali musiqalar qo‘shing. Faol musiqalar saytda avtomatik, tasodifiy tartibda fon sifatida ijro etiladi.
          </p>
        </div>
      </header>

      <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <fieldset disabled={busy} className="space-y-4">
          <legend className="mb-4 text-base font-semibold">
            {editingId ? 'Musiqani tahrirlash' : 'Yangi musiqa'}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="music-title" className="text-sm font-medium">Musiqa nomi</label>
              <Input id="music-title" required maxLength={120} value={draft.title} placeholder="Musiqa nomini kiriting"
                onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="music-artist" className="text-sm font-medium">Ijrochi <span className="font-normal text-muted-foreground">(ixtiyoriy)</span></label>
              <Input id="music-artist" maxLength={120} value={draft.artist} placeholder="Ijrochi yoki guruh"
                onChange={(event) => setDraft({ ...draft, artist: event.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="music-url" className="text-sm font-medium">YouTube havolasi</label>
            <Input id="music-url" type="url" required value={draft.youtubeUrl} placeholder="https://www.youtube.com/watch?v=..."
              aria-describedby="music-url-help" onChange={(event) => setDraft({ ...draft, youtubeUrl: event.target.value })} />
            <p id="music-url-help" className="text-xs text-muted-foreground">YouTube video yoki youtu.be havolasini kiriting. Video ijro etishga ruxsat berilgan bo‘lishi kerak.</p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
            <div className="space-y-1.5 sm:w-40">
              <label htmlFor="music-order" className="text-sm font-medium">Ro‘yxatdagi tartib</label>
              <Input id="music-order" type="number" min={0} max={10000} step={1} required value={draft.sortOrder}
                onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })} />
            </div>
            <label htmlFor="music-enabled" className="flex min-h-11 items-center gap-2.5 text-sm font-medium">
              <input id="music-enabled" type="checkbox" checked={draft.enabled} className="h-4 w-4 accent-primary"
                onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
              Saytda ijro etilsin
            </label>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="submit" disabled={!valid || busy}>
              {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              {saving ? 'Saqlanmoqda…' : editingId ? 'O‘zgarishlarni saqlash' : 'Musiqa qo‘shish'}
            </Button>
            {editingId && <Button type="button" variant="outline" onClick={() => { resetDraft(); setError(null); }}>Bekor qilish</Button>}
          </div>
        </fieldset>
      </form>

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

      <section aria-labelledby="music-list-heading" className="space-y-3">
        <h2 id="music-list-heading" className="text-base font-semibold">Musiqalar ro‘yxati</h2>
        {loading ? (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Musiqalar yuklanmoqda…</p>
        ) : loadError ? (
          <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <p className="text-destructive">{loadError}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>Qayta urinish</Button>
          </div>
        ) : tracks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <Music2 className="mx-auto mb-3 h-7 w-7 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Hali musiqa qo‘shilmagan</p>
            <p className="mt-1 text-sm text-muted-foreground">Birinchi YouTube havolasini yuqoridagi forma orqali qo‘shing.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {tracks.map((track) => (
              <li key={track.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-words font-semibold">{track.title}</span>
                    <span className={track.enabled ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400' : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'}>{track.enabled ? 'Faol' : 'Nofaol'}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{track.artist || 'Ijrochi ko‘rsatilmagan'} · Tartib: {track.sortOrder}</p>
                  <a href={musicVideoUrl(track.youtubeVideoId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    YouTube’da ochish <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={busy} aria-label={`${track.title} — tahrirlash`} onClick={() => edit(track)}>
                    <Pencil aria-hidden="true" /> Tahrirlash
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} className="text-destructive hover:text-destructive" aria-label={`${track.title} — o‘chirish`} onClick={() => void remove(track)}>
                    {deletingId === track.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />} O‘chirish
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
