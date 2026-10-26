'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MailboxResources } from './mailbox-resources';
import { MailboxUnlink } from './mailbox-unlink';
import { availableMailboxes, unlockMailbox, type OwnedMailbox } from '@/lib/mailbox-management';
import { mailboxAccess, accessDescription } from '@/lib/mailbox-access';
import { showUpgrade, swapCandidates, type SwapCandidate } from '@/lib/mailbox-lock';
import { MAIN_SITE_URL } from '@/lib/site';
import type { MailboxSlotStatus } from '@/lib/mail-types';

interface Props {
 boxes: OwnedMailbox[] | null;
 accountEmails: string[] | null;
 slots: MailboxSlotStatus | null;
 wantedMailboxId?: string;
}
export function MailboxManagement({ boxes, accountEmails, slots, wantedMailboxId }: Props) {
 const router = useRouter();
 const available = boxes === null ? null : availableMailboxes(boxes, accountEmails);
 const full = slots?.plan !== 'STAFF' && slots?.totalLimit !== null && slots != null && (slots.full || slots.totalUsed >= slots.totalLimit);
 const near = !full && slots?.plan !== 'STAFF' && slots?.totalLimit != null
  && slots.totalLimit - slots.totalUsed <= Math.max(1, Math.ceil(slots.totalLimit * .2));
 const candidates = swapCandidates(boxes ?? []);
 return <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-5 sm:px-6 sm:py-8">
  <header className="flex flex-wrap items-center justify-between gap-3">
   <div><Link href="/" className="mb-2 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft aria-hidden className="h-4 w-4" />Xatlarga qaytish</Link>
    <h1 className="text-xl font-bold sm:text-2xl">Qutilarni boshqarish</h1></div>
   <Button type="button" variant="outline" className="min-h-11" onClick={() => router.refresh()}><RefreshCw aria-hidden />Qayta yuklash</Button>
  </header>

  <section aria-label="Pochta sig‘imi" className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
   <div className="flex items-center gap-3"><Mail aria-hidden className="h-5 w-5 text-primary" /><h2 className="font-semibold">Pochta qutilari</h2>
    {slots && slots.plan !== 'STAFF' && <span className="ml-auto text-lg font-bold tabular-nums">{slots.totalUsed} / {slots.totalLimit === null ? 'cheksiz' : slots.totalLimit}</span>}
   </div>
   {!slots && <p className="text-sm text-muted-foreground">Pochta limiti aniqlanmadi. Qayta yuklab ko‘ring.</p>}
   {slots?.plan === 'STAFF' && <p className="text-sm text-muted-foreground">Pochta qutilaringizni shu yerdan boshqaring.</p>}
   {(full || near) && <p role="status" className="rounded-xl border border-warning-border bg-warning-soft p-3 text-sm text-warning">
    {full ? 'Pochta limiti to‘lgan. Yangi savdodan oldin qutilaringizni ko‘rib chiqing.' : 'Pochta limiti to‘lay deb qoldi — ' + (slots!.totalLimit! - slots!.totalUsed) + ' ta joy qoldi.'}
   </p>}
   {slots && slots.plan !== 'STAFF' && <details>
    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Limit tafsilotlari</summary>
    <div className="space-y-2 pb-2 text-sm text-muted-foreground">
     <p>Custom: {slots.customUsed} / {slots.customLimit === null ? 'cheksiz' : slots.customLimit}</p>
     {slots.exemptUsed !== undefined && <p>Limitdan tashqari: {slots.exemptUsed}</p>}
     {slots.resourceUsed !== undefined && <p>Resursda: {slots.resourceUsed}</p>}
     <p>Custom chegarasi yangi nomli quti yaratish uchun; mavjud qutini o‘qish umumiy limit bo‘yicha tanlanadi.</p>
     <p>Qutini hisobdan uzish ajratilgan joyni kamaytirmaydi. Joy tasdiqlangan topshirish yoki bo‘shatishdan keyin qayta hisoblanadi.</p>
    </div>
   </details>}
  </section>

  {boxes !== null && accountEmails === null && <p className="text-sm text-muted-foreground">Akkountlarga bog‘lanish aniqlanmadi. Qaysi quti ulanmaganini tekshirish uchun qayta yuklang.</p>}
  {available && available.length > 0 && <section aria-label="Akkountga ulanmagan qutilar" className="space-y-3">
   <h2 className="font-semibold">Akkountga ulanmagan qutilar <span className="text-muted-foreground">· {available.length}</span></h2>
   <ul className="divide-y divide-border rounded-2xl border border-border">
    {available.map(box => <li key={box.id} className="flex items-center gap-3 p-4">
     <span className="min-w-0 flex-1 break-all text-sm">{box.email}</span>
     <a className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={MAIN_SITE_URL + '/mailboxes/custom/' + encodeURIComponent(box.id) + '/link'}>Ulash</a>
    </li>)}
   </ul>
  </section>}

  <section aria-label="Qutilar ro‘yxati" className="space-y-3">
   <h2 className="font-semibold">Barcha qutilar</h2>
   {boxes === null ? <p role="alert" className="text-sm text-destructive">Qutilar ro‘yxati yuklanmadi. Qayta yuklab ko‘ring.</p>
    : boxes.length === 0 ? <p className="text-sm text-muted-foreground">Pochta qutisi yo‘q.</p>
    : <ul className="space-y-3">{boxes.map(box => {
     const state = mailboxAccess(box);
     const canSelect = state === 'LOCKED' || state === 'RECOVERY' || state === 'GRACE' && !box.selectedForFree;
     return <li key={box.id + ':' + state} id={'mailbox-' + box.id} className="scroll-mt-4 space-y-2 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
       <h3 className="min-w-0 break-all text-sm font-semibold">{box.email}</h3>
       {state !== 'LOCKED' && <Link href={'/' + encodeURIComponent(box.id)} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">Xatlarni ochish</Link>}
      </div>
      <p className="text-xs text-muted-foreground">{state === 'LOCKED' ? 'Qulflangan — xatlar saqlanadi' : accessDescription(box)}</p>
      {box.activeTrade && <p className="text-xs text-muted-foreground">Davom etayotgan savdoga biriktirilgan</p>}
      {box.tradeId === null && box.kind !== 'CUSTOM' && box.activeTrade !== true && <MailboxUnlink mailboxId={box.id} email={box.email} />}
      {canSelect && slots && <MailboxAccessSelection mailbox={box} candidates={candidates.filter(candidate => candidate.id !== box.id)} plan={slots.plan} initiallyOpen={wantedMailboxId === box.id} />}
     </li>;
    })}</ul>}
  </section>

  <details className="rounded-2xl border border-border p-4">
   <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Hajm va qutini bo‘shatish</summary>
   <div className="pt-3"><MailboxResources /></div>
  </details>
 </div>;
}

function MailboxAccessSelection({ mailbox, candidates, plan, initiallyOpen }: { mailbox: OwnedMailbox; candidates: SwapCandidate[]; plan: string; initiallyOpen: boolean }) {
 const router = useRouter();
 const [open, setOpen] = useState(initiallyOpen);
 const [picked, setPicked] = useState('');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const request = useRef<AbortController | null>(null);
 useEffect(() => () => request.current?.abort(), []);
 async function submit(event: FormEvent) {
  event.preventDefault();
  if (request.current || busy || !candidates.some(candidate => candidate.id === picked && candidate.disabledReason === null)) return;
  const controller = new AbortController();
  request.current = controller;
  setBusy(true); setError(null);
  try {
   await unlockMailbox(mailbox.id, picked, controller.signal);
   if (controller.signal.aborted) return;
   setOpen(false); setPicked(''); router.refresh();
  } catch (cause) {
   if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Qutini ochib bo‘lmadi.');
  } finally { if (!controller.signal.aborted) { request.current = null; setBusy(false); } }
 }
 return <div className="space-y-3">
  <Button type="button" variant="outline" className="min-h-11" aria-expanded={open} onClick={() => { setOpen(!open); setError(null); }} disabled={busy}>O‘qiladigan qutini tanlash</Button>
  {open && <form onSubmit={submit} className="space-y-3 rounded-xl bg-muted/50 p-3" aria-label={mailbox.email + ': kirishni almashtirish'} aria-busy={busy}>
   <p className="text-sm">Shu quti ochiladi. Uning o‘rniga qaysi quti qulflansin? Xatlar o‘chirilmaydi.</p>
   <fieldset disabled={busy} className="space-y-2">
    <legend className="sr-only">Qulflanadigan quti</legend>
    {candidates.length === 0 && <p className="text-sm text-muted-foreground">Almashtirish uchun ochiq quti yo‘q.</p>}
    {candidates.map(candidate => <label key={candidate.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm">
     <input type="radio" name={'swap-' + mailbox.id} value={candidate.id} checked={picked === candidate.id} disabled={candidate.disabledReason !== null} onChange={() => setPicked(candidate.id)} className="h-4 w-4 shrink-0 accent-ring" />
     <span className="min-w-0 break-all">{candidate.email}{candidate.disabledReason && <span className="block text-xs text-muted-foreground">{candidate.disabledReason} — qulflab bo‘lmaydi</span>}</span>
    </label>)}
   </fieldset>
   {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
   <div className="flex flex-wrap gap-2">
    <Button type="submit" className="min-h-11" disabled={!picked || busy}>{busy ? 'Almashtirilmoqda…' : 'Almashtirishni tasdiqlash'}</Button>
    <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={() => { setOpen(false); setPicked(''); setError(null); }}>Bekor qilish</Button>
   </div>
  </form>}
  {showUpgrade(plan) && <a href={MAIN_SITE_URL + '/plans'} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Tarifni oshirish</a>}
 </div>;
}
