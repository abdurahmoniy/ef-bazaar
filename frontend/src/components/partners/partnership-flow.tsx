'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Handshake,
  Loader2,
  Send,
  Wallet,
  XCircle,
} from 'lucide-react';

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
import { createInvoice } from '@/lib/payment-client';
import { isInsufficientFunds, topUpHref } from '@/lib/wallet-shortfall';
import { cn } from '@/lib/utils';

/**
 * Botni kanalga administrator qilib qo'shish uchun Telegram'ning tayyor
 * havolasi.
 *
 * <p>`?startchannel` Telegram'da kanal tanlash oynasini ochadi va botni
 * darhol administrator qilib tayinlaydi — foydalanuvchi sozlamalar ichida
 * yo'l qidirmaydi. `admin=` da so'ralgan huquqlar ro'yxati bo'lishi shart;
 * `post_messages` eng kami, chunki bittasiz Telegram havolani qabul
 * qilmaydi. Obunachi sonini o'qish uchun qo'shimcha huquq kerak emas —
 * administrator bo'lishning o'zi yetarli.
 */
function addToChannelLink(botUsername: string): string {
  return `https://t.me/${botUsername}?startchannel&admin=post_messages`;
}

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
interface PartnershipFlowProps {
  /**
   * Serverdan keladi, `process.env` dan emas: `NEXT_PUBLIC_*` build paytida
   * kodga yoziladi va konteynerga ish vaqtida berilgan qiymat bu yerga
   * yetib kelmaydi.
   */
  botUsername: string;
}

export function PartnershipFlow({ botUsername }: PartnershipFlowProps) {
  const [settings, setSettings] = useState<PartnerSettings | null>(null);
  const [application, setApplication] = useState<PartnerApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setBusy(true);
    try {
      setApplication(await payPartnershipFee());
      return;
    } catch (e) {
      const message = e instanceof Error ? e.message : "To'lov amalga oshmadi";

      if (!isInsufficientFunds(message)) {
        setError(message);
        setBusy(false);
        return;
      }

      // Mablag' yetmadi. Yetishmayotgan summa xabar matnida keladi —
      // payment-service uni ataylab shunday yozadi.
      const matched = message.match(/(\d+)\s*so['’]m/);
      const missing = matched ? Number(matched[1]) : Math.ceil(settings?.priceSom ?? 0);
      if (missing <= 0) {
        setError(message);
        setBusy(false);
        return;
      }

      // Hisob-fakturani O'ZIMIZ ochamiz va foydalanuvchini to'g'ridan-to'g'ri
      // to'lov sahifasiga olib o'tamiz. Faqat havola berish yetarli emas
      // edi: u yerga borgan odam summani qo'lda kiritishi kerak bo'lardi va
      // xato kiritsa yana shu yerga qaytardi. Savdolarda ham shunday.
      try {
        await createInvoice(missing);
      } catch {
        // Hisob-faktura ochilmadi — summa manzilda qoladi va hamyon
        // sahifasi maydonni o'sha son bilan to'ldiradi.
      }
      window.location.href = topUpHref(missing, '/partnership');
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

        <Step index={2} title="Botni kanalga qo'shing" state={stepState(application, 1)}>
          {botUsername ? (
            <>
              <ol className="ml-4 list-decimal space-y-1.5">
                <li>
                  Pastdagi tugmani bosing — Telegram ochiladi.
                </li>
                <li>
                  Ro&apos;yxatdan <b>kanalingizni tanlang</b>.
                </li>
                <li>
                  Telegram so&apos;raganda <b>&quot;Add Bot as Admin&quot;</b> (Botni admin
                  sifatida qo&apos;shish) ni tasdiqlang.
                </li>
                <li>
                  Shu sahifaga qayting — tekshiruv <b>avtomatik</b> o&apos;tadi, hech narsa
                  kiritish shart emas.
                </li>
              </ol>

              <Button asChild className="gap-2">
                <a href={addToChannelLink(botUsername)} target="_blank" rel="noreferrer">
                  <Send className="h-4 w-4" />
                  Kanalga qo&apos;shish
                </a>
              </Button>

              <p className="text-xs">
                Tugma ishlamasa: Telegramda <b>@{botUsername}</b> ni oching va{' '}
                <code className="rounded bg-muted px-1">/partner</code> yuboring — bot
                o&apos;sha tugmani sizga yuboradi.
              </p>
            </>
          ) : (
            <p className="text-destructive">
              Bot nomi sozlanmagan. Administratorga xabar bering.
            </p>
          )}

          <p className="rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
            Botni <b>kanal egasi</b> qo&apos;shishi kerak. Administrator bo&apos;lsangiz ham
            yetarli emas — hamkorlik kanal egasiga beriladi.
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
