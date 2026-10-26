'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, Copy, Eye, Pause, Play, Plus, RefreshCw } from 'lucide-react';
import { PopupDialog } from '@/components/popups/popup-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createPopupCampaign, listPopupCampaigns, setPopupCampaignStatus } from '@/lib/popups/client';
import { validateCampaign } from '@/lib/popups/campaign-form';
import type { CampaignInput, PopupCampaign, PopupMessage } from '@/lib/popups/types';

const triggers = { BROWSE: 'Bozorni ko‘rayotganda', LISTING_PUBLISHED: 'E’lon joylangandan keyin', EMPTY_SEARCH: 'Qidiruvda natija topilmaganda', TRADE_COMPLETED: 'Yangi savdo yakunlangandan keyin' };
const audiences = { ALL: 'Barcha kirgan foydalanuvchilar', SELLERS: 'E’loni bor sotuvchilar', SELECTED: 'Tanlangan foydalanuvchilar' };
const statuses = { DRAFT: 'Qoralama', ACTIVE: 'Faol', PAUSED: 'To‘xtatilgan' };
const tones = { INFO: 'Ma’lumot', SUCCESS: 'Muvaffaqiyat', WARNING: 'Ogohlantirish' };
function freshDraft(): CampaignInput {
  const now = Date.now();
  return { title: '', message: '', tone: 'INFO', audience: 'ALL', recipientIds: [], trigger: 'BROWSE', actionLabel: '', actionPath: '', startsAt: new Date(now).toISOString(), endsAt: new Date(now+7*86400_000).toISOString(), priority: 0 };
}
function localDate(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16) : '';
}
function dateLabel(iso: string) { return new Date(iso).toLocaleString('uz-UZ', { dateStyle: 'medium', timeStyle: 'short' }); }

export function AdminPopups() {
  const [campaigns, setCampaigns] = useState<PopupCampaign[]>([]);
  const [draft, setDraft] = useState<CampaignInput>(freshDraft);
  const [recipients, setRecipients] = useState('');
  const [preview, setPreview] = useState<PopupMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const loadState = useRef({ version: 0 }).current;
  const reload = useCallback(async () => {
    const request = ++loadState.version;
    setLoading(true); setError(null);
    try { const data = await listPopupCampaigns(); if (request === loadState.version) setCampaigns(data); }
    catch (e) { if (request === loadState.version) setError(e instanceof Error ? e.message : 'Yuklab bo‘lmadi.'); }
    finally { if (request === loadState.version) setLoading(false); }
  }, [loadState]);
  useEffect(() => { void reload(); return () => { loadState.version++; }; }, [loadState, reload]);
  function change<K extends keyof CampaignInput>(field: K, value: CampaignInput[K]) { setDraft(old => ({ ...old, [field]: value })); setNotice(null); }
  function input(): CampaignInput {
    return { ...draft, title: draft.title.trim(), message: draft.message.trim(), actionLabel: draft.actionLabel?.trim() || null, actionPath: draft.actionPath?.trim() || null,
      recipientIds: draft.audience === 'SELECTED' ? [...new Set(recipients.split(/[\s,;]+/).filter(Boolean))] : [] };
  }
  function showPreview(value: CampaignInput & { id?: string }) {
    setPreview({ id: value.id ?? 'preview', title: value.title || 'Xabar sarlavhasi', message: value.message || 'Foydalanuvchiga foydali bo‘lgan qisqa xabar.', tone: value.tone, trigger: value.trigger, actionLabel: value.actionLabel, actionPath: value.actionPath, endsAt: value.endsAt });
  }
  async function save() {
    const value = input(); const problem = validateCampaign(value);
    setError(problem); setNotice(null); if (problem || busy) return;
    setBusy(true);
    try {
      const created = await createPopupCampaign(value);
      loadState.version++; setLoading(false);
      setCampaigns(current => [created, ...current.filter(item => item.id !== created.id)].slice(0,100));
      setNotice('Qoralama saqlandi. Ko‘rib chiqib, “Faollashtirish” tugmasini bosing.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Saqlab bo‘lmadi.'); }
    finally { setBusy(false); }
  }
  async function toggle(item: PopupCampaign) {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const updated = await setPopupCampaignStatus(item.id, item.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE');
      loadState.version++; setLoading(false);
      setCampaigns(current => current.map(row => row.id === updated.id ? updated : row));
      setNotice(updated.status === 'ACTIVE' ? 'Xabar faollashtirildi. Faqat mos foydalanuvchiga, qulay vaqtda ko‘rsatiladi.' : 'Xabar to‘xtatildi. Yangi ko‘rsatishlar to‘xtaydi.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Holatni yangilab bo‘lmadi.'); }
    finally { setBusy(false); }
  }
  function copy(item?: PopupCampaign) {
    const fresh = freshDraft();
    setDraft(item ? { ...fresh, title: item.title, message: item.message, audience: item.audience, recipientIds: item.recipientIds, tone: item.tone, trigger: item.trigger, actionLabel: item.actionLabel, actionPath: item.actionPath, priority: item.priority } : fresh);
    setRecipients(item?.recipientIds.join('\n') ?? ''); setError(null); setNotice(null); titleInput.current?.focus();
  }
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tizim & Resurslar</p><h1 className="mt-2 flex items-center gap-3 text-2xl font-bold"><BellRing className="h-6 w-6 text-primary" />Pop-up xabarlar</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Kerakli xabarni kerakli paytda ko‘rsating. Foydalanuvchi uni yopishi yoki taklif qilingan sahifaga o‘tishi mumkin.</p></div>
      <Button variant="outline" onClick={() => copy()} disabled={busy}><Plus className="h-4 w-4" />Yangi xabar</Button>
    </header>
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6">
      <p className="font-semibold">E’tiborni ehtiyot qilamiz</p><p className="mt-1 text-muted-foreground">Bir sessiyada 1 ta, 24 soatda ko‘pi bilan 2 ta xabar. Oraliq kamida 6 soat. Bir xabar bir foydalanuvchiga qayta ko‘rsatilmaydi. Chat, to‘lov, forma va boshqa oynalar ochiq bo‘lsa kutadi.</p>
    </div>
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
    {notice && <p role="status" className="rounded-xl border border-success-border bg-success-soft p-4 text-sm">{notice}</p>}
    <form onSubmit={e => { e.preventDefault(); void save(); }} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">Xabar yaratish</h2><span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Avval qoralama</span></div>
      <fieldset disabled={busy} className="grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <div className="space-y-2"><Label htmlFor="popup-title">Sarlavha</Label><Input ref={titleInput} id="popup-title" name="title" maxLength={100} required value={draft.title} onChange={e => change('title',e.target.value)} placeholder="Masalan: Birinchi e’loningiz joylandi" /></div>
          <div className="space-y-2"><Label htmlFor="popup-message">Xabar</Label><Textarea id="popup-message" name="message" rows={5} maxLength={600} required value={draft.message} onChange={e => change('message',e.target.value)} placeholder="Nima foyda beradi va keyingi qadam nima?" /><p className="text-right text-xs text-muted-foreground">{draft.message.length}/600</p></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="popup-tone">Ko‘rinish</Label><Select id="popup-tone" value={draft.tone} onChange={e => change('tone',e.target.value as CampaignInput['tone'])}>{Object.entries(tones).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</Select></div><div className="space-y-2"><Label htmlFor="popup-priority">Ustuvorlik (0–10)</Label><Input id="popup-priority" type="number" min={0} max={10} value={draft.priority} onChange={e => change('priority',Number(e.target.value))} /></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="popup-action-label">Tugma nomi (ixtiyoriy)</Label><Input id="popup-action-label" maxLength={60} value={draft.actionLabel ?? ''} onChange={e => change('actionLabel',e.target.value)} placeholder="Bozorni ochish" /></div><div className="space-y-2"><Label htmlFor="popup-action-path">Ichki manzil</Label><Input id="popup-action-path" value={draft.actionPath ?? ''} onChange={e => change('actionPath',e.target.value)} placeholder="/marketplace" list="popup-destinations" /><datalist id="popup-destinations">{['/marketplace','/marketplace/new','/invite','/help','/notifications','/profile?tab=accounts','/profile?tab=favorites'].map(path => <option key={path} value={path} />)}</datalist></div></div>
          <p className="text-xs leading-5 text-muted-foreground">Faqat sayt ichidagi manzil. Tashqi havola va HTML qabul qilinmaydi. Muvaffaqiyat ko‘rinishi haqiqiy natijaga mos bo‘lsin.</p>
        </div>
        <div className="space-y-5 rounded-xl bg-muted/40 p-4">
          <div className="space-y-2"><Label htmlFor="popup-audience">Kimga?</Label><Select id="popup-audience" value={draft.audience} onChange={e => change('audience',e.target.value as CampaignInput['audience'])}>{Object.entries(audiences).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</Select></div>
          {draft.audience === 'SELECTED' && <div className="space-y-2"><Label htmlFor="popup-recipients">Foydalanuvchi UUID’lari</Label><Textarea id="popup-recipients" rows={3} value={recipients} onChange={e => setRecipients(e.target.value)} placeholder="Har bir ID alohida qatorda" /><p className="text-xs text-muted-foreground">Foydalanuvchilar bo‘limidan olingan 1–100 ta ID.</p></div>}
          <div className="space-y-2"><Label htmlFor="popup-trigger">Qachon?</Label><Select id="popup-trigger" value={draft.trigger} onChange={e => change('trigger',e.target.value as CampaignInput['trigger'])}>{Object.entries(triggers).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</Select><p className="text-xs leading-5 text-muted-foreground">Savdo haqidagi xabar chat ichida chiqmaydi; foydalanuvchi 5 daqiqa ichida bozorga qaytsa kutib ko‘rsatiladi.</p></div>
          <div className="space-y-2"><Label htmlFor="popup-start">Boshlanish</Label><Input id="popup-start" type="datetime-local" required value={localDate(draft.startsAt)} onChange={e => change('startsAt',e.target.value ? new Date(e.target.value).toISOString() : '')} /></div>
          <div className="space-y-2"><Label htmlFor="popup-end">Tugash</Label><Input id="popup-end" type="datetime-local" required value={localDate(draft.endsAt)} onChange={e => change('endsAt',e.target.value ? new Date(e.target.value).toISOString() : '')} /><p className="text-xs text-muted-foreground">Mahalliy vaqt. Davomiylik ko‘pi bilan 30 kun.</p></div>
        </div>
      </fieldset>
      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-border pt-5"><Button type="button" data-preview variant="outline" onClick={() => showPreview(input())}><Eye className="h-4 w-4" />Ko‘rib chiqish</Button><Button data-save-draft type="submit" disabled={busy}>{busy ? 'Saqlanmoqda…' : 'Qoralama saqlash'}</Button></div>
    </form>
    <section className="space-y-4" aria-label="Xabarlar ro‘yxati">
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Oxirgi 100 ta xabar</h2><Button variant="ghost" disabled={loading || busy} onClick={() => void reload()}><RefreshCw className="h-4 w-4" />Yangilash</Button></div>
      {loading ? <p role="status" className="py-8 text-center text-muted-foreground">Xabarlar yuklanmoqda…</p> : !campaigns.length ? <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">Hali xabar yo‘q. Birinchi xabaringizni qoralama sifatida saqlang.</div> : campaigns.map(item => {
        const expired = Date.parse(item.endsAt) <= Date.now(); const scheduled = Date.parse(item.startsAt) > Date.now();
        return <article key={item.id} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{item.title}</h3><p className="mt-1 text-xs text-muted-foreground">{audiences[item.audience]} · {triggers[item.trigger]}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{expired ? 'Muddati tugagan' : item.status === 'ACTIVE' && scheduled ? 'Rejalashtirilgan' : statuses[item.status]}</span></div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{item.message}</p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{dateLabel(item.startsAt)} → {dateLabel(item.endsAt)}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4"><dl className="flex flex-wrap gap-5 text-sm"><div><dt className="text-xs text-muted-foreground">Ko‘rsatildi</dt><dd className="mt-1 font-semibold tabular-nums">{item.shownCount}</dd></div><div><dt className="text-xs text-muted-foreground">Tugma bosildi</dt><dd className="mt-1 font-semibold tabular-nums">{item.clickedCount}</dd></div><div><dt className="text-xs text-muted-foreground">Yopildi</dt><dd className="mt-1 font-semibold tabular-nums">{item.dismissedCount}</dd></div></dl><div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" onClick={() => showPreview(item)} aria-label={`${item.title}: ko‘rib chiqish`}><Eye className="h-4 w-4" />Ko‘rish</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => copy(item)}><Copy className="h-4 w-4" />Nusxa</Button><Button data-publish={item.id} size="sm" variant={item.status === 'ACTIVE' ? 'outline' : 'default'} disabled={busy || (expired && item.status !== 'ACTIVE')} onClick={() => void toggle(item)}>{item.status === 'ACTIVE' ? <><Pause className="h-4 w-4" />To‘xtatish</> : <><Play className="h-4 w-4" />Faollashtirish</>}</Button></div></div>
        </article>;
      })}
    </section>
    {preview && <PopupDialog message={preview} preview onDismiss={() => setPreview(null)} />}
  </div>;
}
