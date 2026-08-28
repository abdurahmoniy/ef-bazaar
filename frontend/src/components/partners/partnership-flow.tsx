'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Handshake,
  Loader2,
  Wallet,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { formatPriceUZS } from '@/lib/marketplace-format';
import {
  applyForPartnership,
  getMyApplication,
  getPartnerSettings,
  payPartnershipFee,
  type PartnerApplication,
  type PartnerSettings,
} from '@/lib/partners';
import { isInsufficientFunds, topUpHref } from '@/lib/wallet-shortfall';
import { cn } from '@/lib/utils';

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT ?? '';

type StepState = 'done' | 'active' | 'todo';

/**
 * Ariza qaysi bosqichda turgani.
 *
 * <p>Holatdan hisoblanadi, alohida saqlanmaydi: ikkalasi bo'lganda ular
 * bir-biriga zid bo'lib qolishi mumkin va ekranda yolg'on bosqich
 * ko'rinardi.
 */
function stepState(application: PartnerApplication | null, step: number): StepState {
  const reached = application === null
    ? 0
    : application.status === 'AWAITING_CHANNEL' ? 1
    : application.status === 'AWAITING_PAYMENT' ? 2
    : application.status === 'AWAITING_REVIEW' ? 3
    : 4;

  if (step < reached) return 'done';
  if (step === reached) return 'active';
  return 'todo';
}

function Step({ index, title, state, children }: {
  index: number;
  title: string;
  state: StepState;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition',
            state === 'done' && 'border-emerald-500 bg-emerald-500 text-white',
            state === 'active' && 'border-primary text-primary',
            state === 'todo' && 'border-border text-muted-foreground',
          )}
        >
          {state === 'done' ? <Check className="h-4 w-4" /> : index}
        </div>
        <div className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className={cn('flex-1 pb-6', state === 'todo' && 'opacity-60')}>
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="mt-1.5 space-y-2 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/**
 * Hamkorlikka ariza — bosqichma-bosqich.
 *
 * <p>Har bosqich orasida kutish bor va qaysi kutishda turgani ko'rinib
 * turishi kerak: botni qo'shmadimi, to'lamadimi, yoki admin ko'rmadimi.
 * Uchtasi bir xil "kutilmoqda" bo'lib ko'rinsa, foydalanuvchi nima
 * qilishini bilmaydi.
 */
export function PartnershipFlow() {
  const [settings, setSettings] = useState<PartnerSettings | null>(null);
  const [application, setApplication] = useState<PartnerApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortfall, setShortfall] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([getPartnerSettings(), getMyApplication()]);
      setSettings(s);
      setApplication(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yuklab bo‘lmadi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Kanal tekshiruvi bot tomonidan, sahifadan tashqarida bo'ladi. Shu
  // bosqichda turganda holatni so'rab turamiz — aks holda foydalanuvchi
  // botni qo'shib, sahifada hech narsa o'zgarmaganini ko'rardi.
  useEffect(() => {
    if (application?.status !== 'AWAITING_CHANNEL') return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [application?.status, refresh]);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      setApplication(await applyForPartnership());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ariza ochilmadi');
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    setError(null);
    setShortfall(null);
    setBusy(true);
    try {
      setApplication(await payPartnershipFee());
    } catch (e) {
      const message = e instanceof Error ? e.message : "To'lov amalga oshmadi";
      setError(message);
      // Mablag' yetmasa summani hamyon sahifasiga olib o'tamiz — savdolarda
      // ham shunday ishlaydi.
      if (isInsufficientFunds(message)) {
        const missing = message.match(/(\d+)\s*so['’]m/);
        setShortfall(missing ? Number(missing[1]) : (settings?.priceSom ?? 0));
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
      </div>
    );
  }

  if (application?.status === 'APPROVED') {
    return (
      <div className="mx-auto max-w-2xl space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600 dark:text-emerald-400" />
        <h2 className="text-lg font-bold">Siz hamkorsiz</h2>
        <p className="text-sm text-muted-foreground">
          {application.channelTitle} kanali hamkorlikka qabul qilindi.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Handshake className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Hamkor bo&apos;lish</h1>
          <p className="text-sm text-muted-foreground">
            Kanalingiz orqali efBazaar hamkori bo&apos;ling.
          </p>
        </div>
      </header>

      {settings && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Minimal obunachi</p>
            <p className="text-lg font-bold">{settings.minSubscribers.toLocaleString('uz-UZ')}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Hamkorlik narxi</p>
            <p className="text-lg font-bold">{formatPriceUZS(settings.priceSom)}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          {shortfall !== null && shortfall > 0 && (
            <Button asChild size="sm" variant="outline" className="gap-2">
              <Link href={topUpHref(shortfall, '/hamkorlik')}>
                <Wallet className="h-4 w-4" />
                Hamyonni to&apos;ldirish
              </Link>
            </Button>
          )}
        </div>
      )}

      {application?.status === 'REJECTED' && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Ariza rad etildi{application.reviewNote ? `: ${application.reviewNote}` : '.'}
          </span>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <Step index={1} title="Ariza ochish" state={stepState(application, 0)}>
          {application === null ? (
            <Button onClick={start} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Ariza topshirish
            </Button>
          ) : (
            <p>Ariza ochildi.</p>
          )}
        </Step>

        <Step index={2} title="Botni kanalga admin qilib qo'shing" state={stepState(application, 1)}>
          <p>
            Kanalingiz sozlamalarida{' '}
            <b>{BOT_USERNAME ? `@${BOT_USERNAME.replace('@', '')}` : 'botimizni'}</b> ni
            administrator qilib qo&apos;shing. Bot obunachilar sonini va kanal egasi kimligini
            o&apos;zi tekshiradi.
          </p>
          <p className="text-xs">
            Botni <b>kanal egasi</b> qo&apos;shishi kerak — administrator bo&apos;lsangiz ham
            yetarli emas.
          </p>

          {application?.verificationError && (
            <p className="flex items-start gap-1.5 text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {application.verificationError}
            </p>
          )}

          {application?.status === 'AWAITING_CHANNEL' && !application.verificationError && (
            <p className="flex items-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" />
              Botni qo&apos;shishingiz kutilmoqda…
            </p>
          )}

          {application?.verifiedAt && (
            <p className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              {application.channelTitle} · {application.subscriberCount?.toLocaleString('uz-UZ')}{' '}
              obunachi — tekshiruvdan o&apos;tdi
            </p>
          )}
        </Step>

        <Step index={3} title="To'lov" state={stepState(application, 2)}>
          {application?.status === 'AWAITING_PAYMENT' ? (
            <Button onClick={pay} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {settings ? `${formatPriceUZS(settings.priceSom)} to'lash` : "To'lash"}
            </Button>
          ) : application?.paidAt ? (
            <p>To&apos;landi.</p>
          ) : (
            <p>Kanal tekshiruvidan o&apos;tgach faollashadi.</p>
          )}
        </Step>

        <Step index={4} title="Admin tasdig'i" state={stepState(application, 3)}>
          {application?.status === 'AWAITING_REVIEW' ? (
            <p className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Arizangiz ko&apos;rib chiqilmoqda.
            </p>
          ) : (
            <p>To&apos;lovdan keyin admin arizani ko&apos;rib chiqadi.</p>
          )}
        </Step>
      </div>
    </div>
  );
}
