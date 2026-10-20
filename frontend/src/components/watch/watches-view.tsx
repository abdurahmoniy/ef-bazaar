'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Bell, Search, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { savedSearchFromQuery, savedSearchHref, type SavedSearch, type SavedSearchCriteria, type PriceWatchList, type WatchList, type WatchRow, type WatchKind } from '@/lib/watches';
import { watchRequest } from '@/lib/watches-client';
import { formatCompactNumber } from '@/lib/marketplace-format';

const reason = (row: WatchRow) => !row.paused ? 'Faol' : row.pauseReason === 'LIMIT'
  ? 'Limit sabab pauzada' : row.pauseReason === 'UNAVAILABLE' ? 'Xizmat vaqtincha mavjud emas' : 'Pauzada';

export function WatchesView({ initialQuery = '' }: { initialQuery?: string }) {
  const [searches, setSearches] = useState<WatchList<SavedSearch> | null>(null);
  const [prices, setPrices] = useState<PriceWatchList | null>(null);
  const [errors, setErrors] = useState<Partial<Record<WatchKind, string>>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<SavedSearch | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [search, price] = await Promise.allSettled([
      watchRequest<WatchList<SavedSearch>>('search'), watchRequest<PriceWatchList>('price'),
    ]);
    setErrors({
      ...(search.status === 'rejected' ? { search: String(search.reason.message) } : {}),
      ...(price.status === 'rejected' ? { price: String(price.reason.message) } : {}),
    });
    if (search.status === 'fulfilled') setSearches(search.value);
    if (price.status === 'fulfilled') setPrices(price.value);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function mutate(kind: WatchKind, suffix: string, method: string, body?: unknown) {
    if (busy.current) return false;
    busy.current = true; setPending(true); setMessage('');
    try {
      await watchRequest(kind, suffix, method, body);
      await load(); setMessage('O‘zgarish saqlandi'); return true;
    } catch (error) {
      setErrors(previous => ({ ...previous, [kind]: (error as Error).message })); return false;
    } finally { busy.current = false; setPending(false); }
  }

  function controls(kind: WatchKind, row: WatchRow, data: WatchList<WatchRow>) {
    return <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={pending || (row.paused && !data.available)}
        onClick={() => void mutate(kind, `/${encodeURIComponent(row.id)}`, 'PATCH', { paused: !row.paused })}>
        {row.paused ? 'Davom ettirish' : 'Pauza qilish'}
      </Button>
      <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={pending || !data.available}
        onClick={() => void mutate(kind, '/priorities', 'PUT', { ids: [row.id, ...data.items.filter(item => item.id !== row.id).map(item => item.id)] })}>Asosiy qilish</Button>
      <Button type="button" size="sm" variant="ghost" className="min-h-11 text-destructive" disabled={pending}
        onClick={() => void mutate(kind, `/${encodeURIComponent(row.id)}`, 'DELETE')}>O‘chirish</Button>
    </div>;
  }

  return <div className="space-y-5 pb-6">
    <div className="space-y-2">
      <h1 className="text-xl font-black">Kuzatuvlar</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">Saqlangan qidiruvlar va narx xabarlarini boshqaring. Sevimlilar alohida saqlanadi; narx kuzatuvi uchun o‘zingiz rozilik berasiz.</p>
      <p className="text-sm text-muted-foreground">Tarif tugaganda ma’lumotlar o‘chirilmaydi, limitdan ortiq kuzatuvlar pauza qilinadi. Asosiy kuzatuvni tanlab, ustuvorligini belgilang.</p>
      <Link href="/plans" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary dark:text-secondary underline underline-offset-4">Tarif imkoniyatlari</Link>
    </div>
    {message && <p role="status" className="text-sm text-primary dark:text-secondary">{message}</p>}
    <WatchSection title="Saqlangan qidiruvlar" icon={<Search aria-hidden className="h-5 w-5" />} data={searches} error={errors.search} loading={loading} retry={load}>
      {searches?.items.length === 0 && <p className="text-sm text-muted-foreground">Hali qidiruv yo‘q. Kartalar yoki narx oralig‘ini saqlang.</p>}
      {searches?.items.map(row => <article key={row.id} className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="min-w-0 break-words font-bold">{row.name}</h3><span className="text-xs font-semibold text-muted-foreground">{reason(row)}{row.id === searches.items[0]?.id ? ' · Asosiy' : ''}</span></div>
        <p className="text-sm text-muted-foreground">{row.matchCard.length} ta karta · {row.minPrice === null ? '0' : formatCompactNumber(row.minPrice)} – {row.maxPrice === null ? 'cheklanmagan' : formatCompactNumber(row.maxPrice)} so‘m</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={savedSearchHref(row)} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary dark:text-secondary underline underline-offset-4">Natijalarni ko‘rish</Link>
          <Button type="button" variant="ghost" disabled={pending || !searches.available} onClick={() => { setEditing(row); setEditorKey(key => key + 1); }}>Tahrirlash</Button>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={row.notificationsEnabled} disabled={pending}
          onChange={event => void mutate('search', `/${encodeURIComponent(row.id)}`, 'PATCH', { notificationsEnabled: event.target.checked })} />Qidiruv xabarlari</label>
        {controls('search', row, searches)}
      </article>)}
      {searches && <SearchEditor key={editorKey} initialQuery={initialQuery} editing={editing} pending={pending}
        available={searches.available && (Boolean(editing) || searches.limit === null || searches.items.length < searches.limit)}
        onCancel={() => { setEditing(null); setEditorKey(key => key + 1); }}
        onSave={async body => {
          if (await mutate('search', editing ? `/${encodeURIComponent(editing.id)}` : '', editing ? 'PUT' : 'POST', body)) {
            setEditing(null); setEditorKey(key => key + 1);
          }
        }} />}
    </WatchSection>
    <WatchSection title="Narx kuzatuvlari" icon={<TrendingDown aria-hidden className="h-5 w-5" />} data={prices} error={errors.price} loading={loading} retry={load}>
      {prices && <div className="space-y-1 rounded-xl bg-muted/50 p-3">
        <label className="flex min-h-11 items-center gap-2 text-sm"><input aria-label="Narx xabarlari" type="checkbox" checked={prices.notificationsEnabled} disabled={pending}
          onChange={event => void mutate('price', '/preferences', 'PUT', { notificationsEnabled: event.target.checked, telegramEnabled: prices.telegramEnabled })} />Narx va qidiruv xabarlarini olish</label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input aria-label="Telegram xabarlari" type="checkbox" checked={prices.telegramEnabled} disabled={pending}
          onChange={event => void mutate('price', '/preferences', 'PUT', { notificationsEnabled: prices.notificationsEnabled, telegramEnabled: event.target.checked })} />Ulangan Telegram orqali ham olish</label>
        <p className="text-xs text-muted-foreground">Ilova bildirishnomalari shu umumiy rozilikka bog‘liq. Telegram qo‘shimcha kanal; uni profilingizda ulashing.</p>
      </div>}
      {prices?.items.length === 0 && <p className="text-sm text-muted-foreground">Hali narx kuzatuvi yo‘q. E’lon sahifasida «Narxni kuzatish»ni tanlang.</p>}
      {prices?.items.map(row => <article key={row.id} className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><Link href={`/marketplace/${encodeURIComponent(row.listingId)}`} className="inline-flex min-h-11 items-center text-sm font-bold text-primary dark:text-secondary underline underline-offset-4">E’lonni ko‘rish</Link><span className="text-xs font-semibold text-muted-foreground">{reason(row)}{row.id === prices.items[0]?.id ? ' · Asosiy' : ''}</span></div>
        {controls('price', row, prices)}
      </article>)}
    </WatchSection>
  </div>;
}

function WatchSection({ title, icon, data, error, loading, retry, children }: {
  title: string; icon: ReactNode; data: WatchList<WatchRow> | null; error?: string;
  loading: boolean; retry: () => Promise<void>; children: ReactNode;
}) {
  return <section aria-label={title} className="min-w-0 space-y-3 rounded-2xl border border-border p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-bold">{icon}{title}</h2>
      {data && <span className="text-sm font-semibold">{data.items.filter(row => !row.paused).length} / {data.available ? data.limit ?? '∞' : '—'} faol</span>}
    </div>
    {data && <p className="text-sm text-muted-foreground">{!data.available ? 'Tarif imkoniyatlari aniqlanmadi. Yangi kuzatuv va davom ettirish vaqtincha yopiq.' : data.immediate ? 'Mos yangilik topilganda xabar beriladi.' : 'Har kuni 19:00 da bitta jamlanma · Asia/Samarkand. Bo‘sh jamlanma yuborilmaydi.'}</p>}
    {loading && !data && <p role="status" className="text-sm text-muted-foreground">Yuklanmoqda…</p>}
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" variant="outline" onClick={() => void retry()}>Qayta urinish</Button></div>}
    {children}
  </section>;
}

function SearchEditor({ initialQuery, editing, pending, available, onSave, onCancel }: {
  initialQuery: string; editing: SavedSearch | null; pending: boolean; available: boolean;
  onSave: (body: SavedSearchCriteria & { name: string; notificationsEnabled: boolean }) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft] = useState(() => {
    if (editing) return editing;
    try { return savedSearchFromQuery(new URLSearchParams(initialQuery)); }
    catch { return { matchCard: [], matchStrictness: 4, minPrice: null, maxPrice: null }; }
  });
  const [name, setName] = useState(editing?.name ?? 'Saqlangan qidiruv');
  const [minPrice, setMinPrice] = useState(draft.minPrice?.toString() ?? '');
  const [maxPrice, setMaxPrice] = useState(draft.maxPrice?.toString() ?? '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(editing?.notificationsEnabled ?? true);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const query = new URLSearchParams();
      draft.matchCard.forEach(card => query.append('matchCard', card));
      query.set('matchStrictness', String(draft.matchStrictness));
      if (minPrice) query.set('minPrice', minPrice);
      if (maxPrice) query.set('maxPrice', maxPrice);
      const criteria = savedSearchFromQuery(query);
      if (!name.trim()) throw new Error('Qidiruv nomini kiriting');
      if (!available || pending) return;
      await onSave({ name: name.trim(), ...criteria, notificationsEnabled });
    } catch (problem) { setError((problem as Error).message); }
  }
  return <form onSubmit={submit} className="space-y-3 rounded-xl bg-muted/40 p-4">
    <h3 className="font-bold">{editing ? 'Qidiruvni tahrirlash' : 'Qidiruvni saqlash'}</h3>
    <p className="text-xs text-muted-foreground">Faqat o‘yinchi kartalari va narx oralig‘i. Platforma, matn va boshqa filtrlar saqlanmaydi.</p>
    <label className="block space-y-1 text-sm">Nomi<Input value={name} onChange={event => setName(event.target.value)} maxLength={100} required /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block space-y-1 text-sm">Eng kam narx (so‘m)<Input inputMode="numeric" value={minPrice} onChange={event => setMinPrice(event.target.value)} placeholder="0" /></label>
      <label className="block space-y-1 text-sm">Eng yuqori narx (so‘m)<Input inputMode="numeric" value={maxPrice} onChange={event => setMaxPrice(event.target.value)} placeholder="Cheklanmagan" /></label>
    </div>
    <p className="text-sm text-muted-foreground">{draft.matchCard.length} ta o‘yinchi kartasi{draft.matchCard.length ? ` · qat’iylik ${draft.matchStrictness}/10` : ''}. <Link href={`${savedSearchHref(draft)}#marketplace-player-filter`} className="text-primary dark:text-secondary underline underline-offset-4">Bozorda kartalarni tanlash</Link></p>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={notificationsEnabled} onChange={event => setNotificationsEnabled(event.target.checked)} />Bu qidiruv uchun xabar olish</label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!available && <p className="text-sm text-muted-foreground">Yaratish uchun tarif imkoniyati va bo‘sh kuzatuv joyi kerak. Mavjud kuzatuvni tahrirlang/o‘chiring yoki Pro tarifini ko‘ring. Pauzadagilar ham yaratish limitida hisoblanadi.</p>}
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending || !available}><Bell aria-hidden className="h-4 w-4" />{pending ? 'Saqlanmoqda…' : 'Saqlash'}</Button>{editing && <Button type="button" variant="outline" onClick={onCancel}>Bekor qilish</Button>}</div>
  </form>;
}
