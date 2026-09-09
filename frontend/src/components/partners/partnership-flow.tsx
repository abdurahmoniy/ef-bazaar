'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowRight, Ban, Bell, Check, CheckCircle2, Clock, Coins,
  Handshake, Headphones, Loader2, MousePointerClick, RefreshCw, Send, Settings2, Store, Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { LinkTelegramButton } from '@/components/profile/link-telegram-button';
import { formatPriceUZS } from '@/lib/marketplace-format';
import {
  applyForPartnership, cancelPartnership, getMyApplication, getPartnerSettings,
  payPartnershipFee, type PartnerApplication, type PartnerSettings,
} from '@/lib/partners';
import { createInvoice } from '@/lib/payment-client';
import { trackGrowth } from '@/lib/growth-analytics';
import { isInsufficientFunds, topUpHref } from '@/lib/wallet-shortfall';
import { cn } from '@/lib/utils';

type StepState = 'done' | 'active' | 'todo';

function stepState(application: PartnerApplication | null, step: number): StepState {
  const reached = !application || ['REJECTED', 'CANCELLED'].includes(application.status) ? 0
    : application.status === 'AWAITING_CHANNEL' ? 1
    : application.status === 'AWAITING_PAYMENT' ? 2
    : application.status === 'AWAITING_REVIEW' ? 3 : 4;
  return step < reached ? 'done' : step === reached ? 'active' : 'todo';
}

function Step({ index, title, state, children }: {
  index: number; title: string; state: StepState; children: React.ReactNode;
}) {
  return (
    <li data-step-state={state} aria-current={state === 'active' ? 'step' : undefined} className="flex gap-3">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
        state === 'done' ? 'border-emerald-600 bg-emerald-600 text-white' : state === 'active'
          ? 'border-primary bg-primary/10 text-primary dark:text-secondary' : 'border-border bg-muted text-muted-foreground')}>
        {state === 'done' ? <><Check className="h-4 w-4" /><span className="sr-only">Bajarildi</span></> : index}
      </span>
      <div className="min-w-0 flex-1 space-y-2 pt-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

function PartnershipOverview({ authenticated }: { authenticated: boolean }) {
  const benefits = [
    { icon: Coins, title: 'Narxni o‘zingiz belgilang', text: 'Kanalingizga e’lon joylash haqini o‘zingiz tanlaysiz va panelda o‘zgartirasiz.' },
    { icon: Store, title: 'Sotuvchilar kanalingizni topadi', text: 'Faol hamkor kanali e’lon joylayotgan sotuvchilarga tanlash uchun ko‘rinadi.' },
    { icon: Settings2, title: 'Post ko‘rinishini sozlang', text: 'Post bloklari, ularning tartibi va pastki matnini kanalingizga moslang.' },
    { icon: MousePointerClick, title: 'Natijalarni kuzating', text: 'Kanaldan bosilishlar, ro‘yxatdan o‘tishlar va daromadni bir panelda ko‘ring.' },
  ];
  return (
    <>
      <header className="grid items-center gap-8 rounded-2xl border border-border bg-card p-5 sm:p-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary dark:text-secondary"><Handshake className="h-5 w-5" /> Telegram kanal egalari uchun</p>
          <h1 className="max-w-xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Kanalingizga e’lon qabul qiling</h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground">efBazaar sotuvchilari kanalingizni tanlasin. Joylash narxi va post ko‘rinishini o‘zingiz belgilang.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link
                href={authenticated ? '#application' : '/auth/login?from=/partnership'}
                onClick={() => trackGrowth('partnership_open', { placement: 'partnership_hero', state: authenticated ? 'authenticated' : 'guest' })}
              >
                {authenticated ? 'Arizaga o‘tish' : 'Kirish va shartlarni ko‘rish'} <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="/support?category=PARTNERSHIP">
                <Headphones className="h-4 w-4" /> Hamkorlik chati
              </Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Ariza → kanal tekshiruvi → to‘lov → admin tasdig‘i</p>
        </div>
        <figure className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-muted/50 p-4">
          <figcaption className="mb-3 flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground"><span>Telegram posti</span><span className="rounded-full border border-border bg-card px-2 py-1">Namuna</span></figcaption>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="relative flex aspect-[2/1] items-center justify-center overflow-hidden bg-primary/10 p-6" aria-hidden="true">
              <div className="absolute inset-5 rounded-lg border border-primary/20"><div className="absolute inset-y-0 left-1/2 border-l border-primary/20" /><div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20" /></div>
              <span className="relative rounded-lg border border-border bg-card px-4 py-2 text-lg font-bold">eFootball akkaunti</span>
            </div>
            <div className="space-y-3 p-4 text-sm">
              <p className="font-semibold">Sizning kanalingiz · efBazaar</p>
              <p className="leading-relaxed text-muted-foreground">Akkaunt tavsifi, o‘yinchilar va sotuvchi belgilagan narx shu yerda ko‘rinadi.</p>
              <div className="flex items-center justify-center gap-2 rounded-lg bg-primary/10 px-3 py-2 font-medium text-primary dark:text-secondary">E’lonni ko‘rish <ArrowRight className="h-4 w-4" /></div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Faqat ko‘rinish namunasi. Haqiqiy post e’lon ma’lumotlari va kanal sozlamalaridan tuziladi.</p>
        </figure>
      </header>
      <section aria-label="Hamkorlik imkoniyatlari" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {benefits.map(({ icon: Icon, title, text }) => <article key={title} className="space-y-3 rounded-xl border border-border bg-card p-5"><Icon className="h-5 w-5 text-primary dark:text-secondary" /><h2 className="font-semibold">{title}</h2><p className="text-sm leading-relaxed text-muted-foreground">{text}</p></article>)}
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Daromad qanday hisoblanadi?</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">E’lon joylashdan daromad — siz belgilagan post haqi. Bu hamkorlik bo‘yicha boshqa to‘lovlardan alohida hisoblanadi.</p>
          <p className="text-sm leading-relaxed text-muted-foreground">Platforma shartiga qarab, qo‘shimcha to‘lov <strong className="font-medium text-foreground">efBazaar savdo komissiyasidan ulush yoki belgilangan oylik to‘lov</strong> bo‘ladi. Bu ikki shart bir vaqtda qo‘llanmaydi. Amaldagi shartlar hisobingizda ko‘rsatiladi.</p>
        </section>
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Boshlashdan oldin</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Kanal egasining Telegram akkauntini efBazaar hisobingizga ulang.</li>
            <li>Botni kanal egasi qo‘shishi kerak. Faqat administrator bo‘lish yetarli emas.</li>
            <li>Bot Telegram’da kanalingizga post joylash huquqini so‘raydi.</li>
            <li>Minimal obunachi talabi va hamkorlik to‘lovi hisobga kirgandan keyin ko‘rsatiladi.</li>
            <li>To‘lov admin ko‘rigidan oldin olinadi. Arizani bekor qilish to‘lovni avtomatik qaytarmaydi.</li>
          </ul>
        </section>
      </div>
    </>
  );
}

interface PartnershipFlowProps {
  botUsername: string;
  authenticated?: boolean;
  telegramLinked?: boolean;
}

export function PartnershipFlow({ botUsername, authenticated = false, telegramLinked = false }: PartnershipFlowProps) {
  useEffect(() => { trackGrowth('partnership_view', { placement: 'partnership', state: authenticated ? 'authenticated' : 'guest' }); }, [authenticated]);
  return (
    <div className="w-full space-y-6 pb-6">
      <PartnershipOverview authenticated={authenticated} />
      {authenticated ? <PartnershipApplication botUsername={botUsername} telegramLinked={telegramLinked} /> : (
        <section className="flex flex-col gap-4 rounded-xl border border-primary/25 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-semibold">Hamkorlikni boshlang</h2><p className="mt-1 text-sm text-muted-foreground">Hisobga kiring, amaldagi shartlarni ko‘ring va ariza oching.</p></div>
          <Button asChild className="shrink-0"><Link href="/auth/login?from=/partnership" onClick={() => trackGrowth('partnership_open', { placement: 'partnership', state: 'guest' })}>Kirish va ariza topshirish <ArrowRight /></Link></Button>
        </section>
      )}
    </div>
  );
}

function PartnershipApplication({ botUsername, telegramLinked }: { botUsername: string; telegramLinked: boolean }) {
  const [settings, setSettings] = useState<PartnerSettings | null>(null);
  const [application, setApplication] = useState<PartnerApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const mutationInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (mutationInFlight.current) return;
    const id = ++requestId.current;
    setRefreshing(true);
    try {
      const [s, a] = await Promise.all([getPartnerSettings(), getMyApplication()]);
      if (id !== requestId.current) return;
      setSettings(s); setApplication(a); setLoaded(true); setLoadError(null);
    } catch (e) {
      if (id === requestId.current) setLoadError(e instanceof Error ? e.message : 'Yuklab bo‘lmadi');
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    const pending = requestId;
    void refresh();
    const onFocus = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus);
    return () => { pending.current++; window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [refresh]);
  useEffect(() => {
    if (!application?.status.startsWith('AWAITING_')) return;
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 10000);
    return () => clearInterval(timer);
  }, [application?.status, refresh]);

  async function mutate(action: () => Promise<PartnerApplication>, fallback: string) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true; requestId.current++; setRefreshing(false); setError(null); setBusy(true);
    try { setApplication(await action()); }
    catch (e) { setError(e instanceof Error ? e.message : fallback); }
    finally { mutationInFlight.current = false; setBusy(false); }
  }
  async function start() {
    if (!telegramLinked) return;
    await mutate(async () => { const next = await applyForPartnership(); trackGrowth('partnership_apply', { placement: 'partnership', state: next.status }); return next; }, 'Ariza ochilmadi');
  }
  async function cancel() {
    if (!window.confirm("Ariza bekor qilinsinmi? To‘langan bo‘lsa pul avtomatik qaytarilmaydi.")) return;
    await mutate(cancelPartnership, 'Bekor qilib bo‘lmadi');
  }
  async function pay() {
    await mutate(async () => {
      try { return await payPartnershipFee(); }
      catch (e) {
        const message = e instanceof Error ? e.message : 'To‘lov amalga oshmadi';
        if (!isInsufficientFunds(message)) throw e;
        const matched = message.match(/(\d+)\s*so['’]m/);
        const missing = matched ? Number(matched[1]) : Math.ceil(settings?.priceSom ?? 0);
        if (missing <= 0) throw e;
        try { await createInvoice(missing); } catch { /* The wallet can create the invoice from the amount in the URL. */ }
        window.location.href = topUpHref(missing, '/partnership');
        throw new Error('To‘lov uchun hamyonni to‘ldiring, so‘ng arizaga qayting.');
      }
    }, 'To‘lov amalga oshmadi');
  }

  const open = application?.status.startsWith('AWAITING_');
  const restart = !application || application.status === 'REJECTED' || application.status === 'CANCELLED';
  const actionDisabled = busy || refreshing || !!loadError;

  return (
    <section id="application" className="scroll-mt-20 space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Sizning arizangiz</h2>{loaded && <Button variant="outline" onClick={() => void refresh()} disabled={refreshing || busy}><RefreshCw className={cn(refreshing && 'animate-spin')} /> Holatni yangilash</Button>}</div>
      {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Ariza va shartlar yuklanmoqda…</p>}
      {loadError && <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"><p className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /> {loadError}</p><p className="text-sm text-muted-foreground">Arizaning amaldagi holatini tekshirib bo‘lmadi.</p><Button variant="outline" onClick={() => void refresh()} disabled={refreshing}>Qayta urinish</Button></div>}
      {loaded && application?.status === 'APPROVED' ? (
        <div className="space-y-4"><p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-5 w-5" /> Siz hamkorsiz</p><p className="text-sm text-muted-foreground">{application.channelTitle || 'Kanalingiz'} hamkorlikka qabul qilindi. Post narxi va ko‘rinishini panelda sozlang.</p><Button asChild><Link href="/partner">Hamkor paneliga o‘tish <ArrowRight /></Link></Button></div>
      ) : loaded && (
        <>
          {settings && <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Minimal obunachi</p><p className="mt-1 text-lg font-semibold">{settings.minSubscribers.toLocaleString('uz-UZ')}</p></div><div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Hamkorlik to‘lovi</p><p className="mt-1 text-lg font-semibold">{formatPriceUZS(settings.priceSom)}</p></div><div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Standart daromad sharti</p><p className="mt-1 text-sm font-semibold">{settings.defaultPayoutMode === 'PERCENT' ? `efBazaar komissiyasidan ${settings.defaultTradePercentBp / 100}%` : `Oyiga ${formatPriceUZS(settings.defaultFixedMonthlySom)}`}</p><p className="mt-1 text-xs text-muted-foreground">Kanal uchun amaldagi shart panelda ko‘rsatiladi.</p></div></div>}
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          {application?.status === 'REJECTED' && <p role="status" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">Ariza rad etildi{application.reviewNote ? `: ${application.reviewNote}` : '.'} Sababni hisobga olib, yangi ariza ochishingiz mumkin.</p>}
          {application?.status === 'CANCELLED' && <p role="status" className="rounded-lg border border-border bg-muted/40 p-4 text-sm">Ariza bekor qilingan{application.cancelReason ? `: ${application.cancelReason}` : '.'} Yangi ariza ochishingiz mumkin.</p>}
          {!telegramLinked ? (
            <div className="space-y-4 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
              <div className="space-y-2">
                <h3 className="font-semibold">Kanal egasining Telegram akkauntini ulang</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">Hamkorlik uchun bu hisobga kanalingiz egasi bo‘lgan Telegram akkaunti ulangan bo‘lishi kerak. Bot kanalni aynan shu akkaunt orqali tekshiradi.</p>
                <p className="text-sm leading-relaxed text-muted-foreground">Quyida Telegram’ni ulang. Muvaffaqiyatli ulangach, shu sahifa yangilanadi va arizani davom ettirasiz.</p>
              </div>
              <LinkTelegramButton botUsername={botUsername} alreadyLinked={false} />
            </div>
          ) : <ol className="space-y-6">
            <Step index={1} title="Ariza ochish" state={stepState(application, 0)}>{restart ? <><p>Shartlar bilan tanishing va kanalingiz uchun ariza oching. Keyin botni qo‘shish bosqichi ochiladi.</p><Button onClick={start} disabled={actionDisabled}>{busy && <Loader2 className="animate-spin" />}{application ? 'Yangi ariza ochish' : 'Ariza topshirish'}</Button></> : <p>Ariza ochildi.</p>}</Step>
            <Step index={2} title="Kanalni ulash va tekshirish" state={stepState(application, 1)}>
              {application?.status === 'AWAITING_CHANNEL' ? <><p>Telegram’da kanalingizni tanlang va botga post joylash huquqini bering. Keyin shu sahifaga qayting — holat avtomatik yangilanadi.</p>{botUsername ? <><Button asChild><a href={`https://t.me/${botUsername}?startchannel&admin=post_messages`} target="_blank" rel="noreferrer" onClick={() => trackGrowth('partnership_channel_open', { placement: 'partnership', state: 'AWAITING_CHANNEL' })}><Send /> Kanalga qo‘shish</a></Button><p className="text-xs">Tugma ishlamasa, Telegram’da @{botUsername} ga /partner yuboring.</p></> : <p className="text-destructive">Bot nomi sozlanmagan. Keyinroq holatni yangilang yoki yordam markaziga murojaat qiling.</p>}{application.verificationError && <p role="alert" className="text-destructive">{application.verificationError} Talabni to‘g‘rilang va botni qayta qo‘shing.</p>}<p className="flex items-center gap-2"><Clock className="h-4 w-4" /> Kanal tekshiruvi kutilmoqda.</p></> : !restart && application?.verifiedAt ? <p>{application.channelTitle} · {application.subscriberCount?.toLocaleString('uz-UZ')} obunachi. Kanal tekshirildi.</p> : <p>Ariza ochilgach, botni kanal egasi qo‘shadi va obunachi soni tekshiriladi.</p>}
            </Step>
            <Step index={3} title="Hamkorlik to‘lovi" state={stepState(application, 2)}>{application?.status === 'AWAITING_PAYMENT' ? <><p>To‘lov hamyondan olinadi, keyin ariza admin ko‘rigiga o‘tadi. Bekor qilsangiz, to‘lov avtomatik qaytarilmaydi.</p><Button onClick={pay} disabled={actionDisabled || !settings}>{busy ? <Loader2 className="animate-spin" /> : <Wallet />}{settings ? `${formatPriceUZS(settings.priceSom)} to‘lash` : 'To‘lash'}</Button></> : !restart && application?.paidAt ? <p>To‘lov amalga oshdi.</p> : <p>Kanal tekshiruvidan keyin to‘lov qilasiz.</p>}</Step>
            <Step index={4} title="Admin ko‘rigi" state={stepState(application, 3)}>{application?.status === 'AWAITING_REVIEW' ? <><p>Arizangiz ko‘rib chiqilmoqda. Hozir qo‘shimcha amal talab qilinmaydi.</p><p className="flex items-start gap-2"><Bell className="mt-0.5 h-4 w-4 shrink-0" /> Qaror haqida saytda va Telegram orqali bildirishnoma keladi. Holatni shu yerda ham ko‘rishingiz mumkin.</p></> : <p>To‘lovdan keyin admin arizani ko‘rib chiqadi. Tasdiqlansa, hamkor paneli ochiladi.</p>}</Step>
          </ol>}
          {open && <div className="border-t border-border pt-4"><Button variant="ghost" onClick={cancel} disabled={busy || refreshing} className="text-destructive"><Ban /> Arizani bekor qilish</Button></div>}
        </>
      )}
    </section>
  );
}
