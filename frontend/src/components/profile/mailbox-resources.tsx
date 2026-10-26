'use client';
import { useCallback, useEffect, useState } from 'react';
import { siteConfig } from '@/lib/site';
import { Button } from '@/components/ui/button';
import { accessDescription } from '@/lib/mailbox-access';
import { canReleaseMailbox, fetchMailboxResources, getReleaseCheck, releaseMailbox, resourceUsage, startReleaseCheck, type MailboxResource, type ReleaseProof } from '@/lib/mailbox-resources';
const deletionLabel = { NONE: 'O‘chirish so‘ralmagan', PENDING: 'O‘chirish kutilmoqda', FAILED: 'O‘chirish bajarilmadi', CONFIRMED: 'Serverdan o‘chirilgani tasdiqlangan' };
function bytes(value: number | null) { if (value === null || !Number.isFinite(value)) return '—'; return value < 1024 ? `${value} B` : value < 1024 ** 2 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 ** 2).toFixed(1)} MB`; }
export function MailboxResources({ admin = false }: { admin?: boolean }) {
  const [rows, setRows] = useState<MailboxResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await fetchMailboxResources(admin)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Resurslar yuklanmadi'); } finally { setLoading(false); }
  }, [admin]);
  useEffect(() => { void load(); }, [load]);
  return <section aria-label={admin ? 'Barcha pochta resurslari' : 'Pochta resurslarim'} className="space-y-3 rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{admin ? 'Barcha pochta resurslari' : 'Pochta resurslarim'}</h2><Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>{loading ? 'Yuklanmoqda…' : 'Resurslarni yangilash'}</Button></div>
    <p className="text-xs text-muted-foreground">Haqiqiy Mailcow hajmi va ajratilgan quota. Saqlangan qutilar ham ko‘rsatiladi. Joy faqat serverdan o‘chirilish tasdiqlangach bo‘shaydi; manzil qayta berilmaydi.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {rows?.length === 0 && <p className="text-sm text-muted-foreground">Pochta resursi yo‘q.</p>}
    <ul className="space-y-3">{rows?.map(box => <ResourceRow key={box.id ?? box.email} box={box} admin={admin} onChanged={load} />)}</ul>
  </section>;
}
function ResourceRow({ box, admin, onChanged }: { box: MailboxResource; admin: boolean; onChanged: () => Promise<void> }) {
  const usage = resourceUsage(box);
  const [proof, setProof] = useState<ReleaseProof | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  async function check() {
    if (!box.id || !proof || busy) return;
    setBusy(true); setError(null);
    try { setProof(await getReleaseCheck(box.id, proof.requestId)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Tekshirish bajarilmadi'); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!checking || proof?.status !== 'PENDING') return;
    const timer = setInterval(() => { void check(); }, 5000);
    return () => clearInterval(timer);
    // The current request/proof must be used for each poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, proof, busy]);
  useEffect(() => {
    if (!proof || !['PENDING', 'VERIFIED'].includes(proof.status)) return;
    const delay = new Date(proof.expiresAt).getTime() - Date.now();
    const timer = setTimeout(() => { setProof(current => current ? { ...current, status: 'EXPIRED' } : null); setChecking(false); }, Math.max(0, Math.min(delay, 2_147_483_647)));
    return () => clearTimeout(timer);
  }, [proof]);
  async function start() {
    if (!box.id || busy || box.provisioningStatus === 'STARTED' || box.deletionStatus === 'PENDING' || box.deletionStatus === 'CONFIRMED') return;
    setBusy(true); setError(null);
    try { setProof(await startReleaseCheck(box.id)); setChecking(true); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Tekshirish boshlanmadi'); } finally { setBusy(false); }
  }
  async function release() {
    if (!box.id || !proof || busy || !canReleaseMailbox(box, proof)) return;
    if (!window.confirm(`${box.email} qutisi va undagi barcha xatlar butunlay o‘chiriladi. Bu amalni qaytarib bo‘lmaydi. Avval kerakli xatlarni eksport qiling. Manzil boshqa berilmaydi. Davom etasizmi?`)) return;
    setBusy(true); setError(null);
    try { const result = await releaseMailbox(box.id, proof.requestId); setOutcome(result.status === 'CONFIRMED' ? 'Serverdan o‘chirilgani tasdiqlangan' : result.status === 'FAILED' ? result.lastError ?? 'O‘chirish bajarilmadi' : 'O‘chirish kutilmoqda — joy hali bo‘shamadi'); setChecking(false); setProof(null); await onChanged(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'O‘chirish bajarilmadi'); } finally { setBusy(false); }
  }
  const held = box.legalHold || box.activeTrade || box.provisioningStatus === 'STARTED';
  return <li className="space-y-2 rounded-lg border border-border p-3 text-sm">
    <p className="break-all font-semibold">{box.email}</p>
    <p className="text-xs text-muted-foreground">{box.accessState ? `${box.accessState} · ${accessDescription(box)}` : 'Kirish holati noma’lum'}{box.slotExempt ? ' · Limitdan tashqari' : ''}{box.retainedUserId ? ' · Saqlangan allocation' : ''}</p>
    <p className={usage.warning ? 'font-semibold text-warning' : ''}>Hajm: {bytes(box.usageBytes)} / {box.quotaBytes === 0 ? 'cheksiz' : bytes(box.quotaBytes)}{usage.percent !== null ? ` · ${usage.percent}%` : ''}{usage.warning ? ' · 80% yoki ko‘proq band' : ''}</p>
    <p className="text-xs text-muted-foreground">{usage.label}{box.usageObservedAt ? ` · ${new Date(box.usageObservedAt).toLocaleString('uz-UZ')}` : ' · O‘lchov vaqti noma’lum'}</p>
    {box.usageError && <p role="alert" className="text-xs text-destructive">{box.usageError}</p>}
    <p className="text-xs">Mailcow: {box.mailcowPresent === true ? 'mavjud' : box.mailcowPresent === false ? 'yo‘q (tasdiqlangan)' : 'mavjudligi noma’lum'} · {deletionLabel[box.deletionStatus] ?? 'O‘chirish holati noma’lum'}</p>
    {box.deleted && box.mailcowPresent !== false && <p className="text-xs text-warning">Lokal yozuv o‘chirilgan; serverdagi quti yo‘qligi hali tasdiqlanmagan.</p>}
    {box.deletionError && <p role="alert" className="text-xs text-destructive">{box.deletionError}</p>}
    {admin && <p className="break-all text-xs text-muted-foreground">Egasi: {box.ownerUserId ?? 'yo‘q'} · Saqlovchi: {box.retainedUserId ?? 'yo‘q'}{box.id === null ? ' · Faqat serverda mavjud' : ''}</p>}
    {box.provisioningStatus === 'STARTED' && <p role="status" className="text-xs text-warning">Yaratish natijasi tasdiqlanmagan. Tekshiruv yakunlanmaguncha bu qutini bo‘shatish yoki qayta yaratish mumkin emas.</p>}
    {box.provisioningError && <p role="alert" className="text-xs text-destructive">{box.provisioningError}</p>}
    {admin && box.provisioningClaimId && <p className="break-all text-xs text-muted-foreground">Yaratish tekshiruvi: {box.provisioningStatus} · {box.provisioningClaimId}</p>}
    {(box.legalHold || box.activeTrade) && <p className="text-xs text-warning">{box.holdReason ?? (box.activeTrade ? 'Faol savdo: tozalash va bo‘shatish himoyalangan.' : 'Nizo yoki huquqiy saqlash: xatlarni o‘chirish va qutini bo‘shatish taqiqlangan.')}</p>}
    {!admin && box.id && box.deletionStatus !== 'CONFIRMED' && <>
      <div className="flex flex-wrap items-center gap-3">{box.ownerUserId != null ? <a href={`${siteConfig.mailUrl}/${encodeURIComponent(box.id)}`} className="inline-flex min-h-11 items-center font-semibold underline">Xatlarni ko‘rish / eksport / tozalash</a> : <p className="text-xs text-muted-foreground">Kirish huquqi uzilgan. Saqlangan resursni tasdiqlangan email ko‘chirish orqali bo‘shatish mumkin.</p>}</div>
      {!proof && <Button variant="outline" size="sm" disabled={busy || held || box.deletionStatus === 'PENDING'} onClick={() => void start()}>Tashqi pochtaga ko‘chirish</Button>}
      {proof && <div className="space-y-2 rounded-lg bg-muted p-3">
        <p>Avval Konami ID’da akkountni boshqa shaxsiy emailingizga ko‘chiring. Keyin Konami saytini o‘z brauzeringizda ochib, parol tiklash formasiga eski <b>{box.email}</b> manzilini kiriting. Platforma yangi “ro‘yxatdan o‘tmagan email” isbotini kutadi. Oddiy uzish yoki belgilash isbot hisoblanmaydi.</p>
        <p className="text-xs">Tekshiruv: {proof.status} · Amal qilish muddati: {new Date(proof.expiresAt).toLocaleString('uz-UZ')}</p>
        {proof.error && <p role="alert">{proof.error}</p>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => void check()}>Isbotni tekshirish</Button><Button variant="outline" size="sm" onClick={() => void start()} disabled={busy || held || box.deletionStatus === 'PENDING'}>Yangi tekshiruv</Button><Button variant="destructive" size="sm" disabled={busy || !canReleaseMailbox(box, proof)} onClick={() => void release()}>Butunlay o‘chirish</Button></div>
        <p className="text-xs">Faqat yangi server isboti tasdiqlangach yakuniy tasdiq ochiladi. O‘chirish qaytarilmaydi. Export nusxasini avval saqlang.</p>
      </div>}
    </>}
    {outcome && <p role="status">{outcome}</p>}{error && <p role="alert" className="text-destructive">{error}</p>}
  </li>;
}
