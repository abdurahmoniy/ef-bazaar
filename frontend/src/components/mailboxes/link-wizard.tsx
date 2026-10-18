'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { getMyAccounts } from '@/lib/accounts-client';
import type { UserAccountResponse } from '@/lib/accounts-types';
import {
  cancelSession,
  getSession,
  markEmailChanged,
  openSession,
  republishSession,
  retrySession,
  MailboxApiError,
} from '@/lib/custom-mailbox-client';
import { konamiForgotPasswordUrl } from '@/lib/konami-links';
import { pollIntervalMs, sessionView, type LinkSession } from '@/lib/link-session';
import { cn } from '@/lib/utils';

interface LinkWizardProps {
  mailboxId: string;
  email: string;
  accounts: UserAccountResponse[];
  initialAccountId: string | null;
  /** Resume a session already running for this box. */
  initialSessionId: string | null;
  /** The account's email already is this box — only the forgot-password check is left. */
  verify: boolean;
}

const STEPS = ['Akkount tanlash', 'Emailni almashtirish', 'Forgot password', 'Tayyor'];

function accountLabel(a: UserAccountResponse): string {
  return a.title?.trim() || 'Nomsiz akkount';
}

export function LinkWizard({ mailboxId, email, accounts, initialAccountId, initialSessionId, verify }: LinkWizardProps) {
  // Accounts already on a custom box keep it; the rest, emailless first.
  const choices = useMemo(
    () => accounts
      .filter((a) => a.status === 'ACTIVE' && !(a.emailSource === 'CUSTOM' && a.emailVerified))
      .sort((a, b) => Number(Boolean(a.email)) - Number(Boolean(b.email))),
    [accounts],
  );
  const [picked, setPicked] = useState<string | null>(initialAccountId ?? choices[0]?.id ?? null);
  const [session, setSession] = useState<LinkSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [needsResync, setNeedsResync] = useState(false);

  const fail = (error: unknown) => {
    toast.error(error instanceof MailboxApiError ? error.message : 'So‘rov bajarilmadi, qayta urinib ko‘ring');
  };

  const run = useCallback(async (action: () => Promise<LinkSession>) => {
    setBusy(true);
    try {
      setSession(await action());
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (initialSessionId) void run(() => getSession(initialSessionId));
  }, [initialSessionId, run]);

  // Poll while a step is waiting for the worker.
  const state = session?.state;
  const sessionId = session?.id;
  useEffect(() => {
    if (!state || !sessionId) return;
    const every = pollIntervalMs(state);
    if (!every) return;
    const timer = setInterval(() => {
      setNow(new Date());
      getSession(sessionId).then(setSession).catch(() => undefined);
    }, every);
    return () => clearInterval(timer);
  }, [state, sessionId]);

  // Verified, but did the account get the address? A lost event leaves it bare.
  useEffect(() => {
    if (state !== 'VERIFIED' || !session) return;
    const timer = setTimeout(() => {
      getMyAccounts()
        .then((r) => {
          const mine = r.ok ? r.data.find((a) => a.id === session.accountId) : undefined;
          setNeedsResync(!mine || mine.email !== session.email);
        })
        .catch(() => undefined);
    }, 5000);
    return () => clearTimeout(timer);
  }, [state, session]);

  const view = session ? sessionView(session, now) : null;
  const step = view?.step ?? 0;
  const pickedAccount = choices.find((a) => a.id === picked) ?? accounts.find((a) => a.id === picked);
  const minutes = view ? `${Math.floor(view.secondsLeft / 60)}:${String(view.secondsLeft % 60).padStart(2, '0')}` : '';
  const returnTo = encodeURIComponent(`/mailboxes/custom/${mailboxId}/link`);

  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value).then(() => toast.success('Nusxalandi'), () => undefined);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-[260px_minmax(0,1fr)] sm:gap-6">
      <nav aria-label="Ulash bosqichlari" className="rounded-2xl border border-border bg-card p-3 sm:p-5">
        <div className="mb-2 flex flex-col sm:mb-3">
          <span className="text-xs text-muted-foreground">Ulanmoqda</span>
          <span className="truncate text-sm font-extrabold sm:text-base">{email}</span>
        </div>
        <ol className="flex gap-1 overflow-x-auto sm:flex-col">
          {STEPS.map((label, i) => {
            const done = i < step || session?.state === 'VERIFIED';
            const current = i === step && session?.state !== 'VERIFIED' ? true : i === 3 && session?.state === 'VERIFIED';
            return (
              <li
                key={label}
                aria-current={current ? 'step' : undefined}
                className={cn('flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-2 sm:min-h-12', current && 'bg-muted')}
              >
                <span
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold sm:h-7 sm:w-7',
                    current ? 'bg-primary text-white' : done ? 'bg-gold text-[#1a1400]' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {done && !current ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                </span>
                <span className={cn('text-xs sm:text-sm', current ? 'font-extrabold' : 'font-semibold')}>{label}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      <section aria-live="polite" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:gap-5 sm:rounded-3xl sm:p-8">
        {!session && !verify && (
          <>
            <div>
              <h1 className="text-lg font-extrabold sm:text-2xl">Qaysi akkountni shu emailga o‘tkazasiz?</h1>
              <p className="mt-1 text-sm text-muted-foreground">Akkountlarim bo‘limidagi akkountlaringiz. Emaili yo‘qlari tepada.</p>
            </div>
            <div role="radiogroup" aria-label="Akkount" className="flex flex-col gap-2">
              {choices.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={a.id === picked}
                  onClick={() => setPicked(a.id)}
                  className={cn(
                    'flex min-h-14 items-center justify-between gap-3 rounded-xl border-2 bg-card px-4 text-left transition sm:min-h-[72px]',
                    a.id === picked ? 'border-primary bg-muted dark:border-primary' : 'border-border hover:bg-muted/60',
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-bold sm:text-base">{accountLabel(a)}</span>
                    <span className="truncate text-xs text-muted-foreground sm:text-sm">{a.email ?? 'Email biriktirilmagan'}</span>
                  </span>
                  {!a.email && <span className="shrink-0 text-xs font-bold text-amber-800 dark:text-amber-300">Emailsiz</span>}
                </button>
              ))}
              <Link
                href={`/profile/accounts/new?returnTo=${returnTo}`}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm font-bold text-primary dark:text-foreground"
              >
                <Plus className="h-4 w-4" aria-hidden /> Boshqa — yangi akkount qo‘shish
              </Link>
            </div>
            <button
              type="button"
              disabled={!picked || busy}
              onClick={() => picked && run(() => openSession(mailboxId, picked, false))}
              className="inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-xl bg-primary px-6 text-base font-extrabold text-white disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Davom etish
            </button>
          </>
        )}

        {!session && verify && (
          <>
            <div>
              <h1 className="text-lg font-extrabold sm:text-2xl">Emailni tasdiqlash</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {pickedAccount ? accountLabel(pickedAccount) : 'Akkount'} emaili allaqachon {email}. Faqat bitta tekshiruv qoldi.
              </p>
            </div>
            <button
              type="button"
              disabled={!picked || busy}
              onClick={() => picked && run(() => openSession(mailboxId, picked, true))}
              className="inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-xl bg-primary px-6 text-base font-extrabold text-white disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Tasdiqlashni boshlash
            </button>
          </>
        )}

        {session && view && (session.state === 'WAIT_EMAIL_CHANGE' || session.state === 'WAIT_RESET') && (
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-extrabold sm:text-2xl">{view.title}</h1>
            <span className="inline-flex min-h-7 shrink-0 items-center rounded-full bg-muted px-3 text-xs font-bold tabular-nums text-primary dark:text-foreground sm:text-sm">
              {minutes} qoldi
            </span>
          </div>
        )}

        {session?.state === 'WAIT_EMAIL_CHANGE' && view && (
          <>
            {view.warning && (
              <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {view.warning} — Konami bu manzil hech qaysi akkountga ulanmaganini aytdi. Avval emailni almashtiring.
              </p>
            )}
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
              <li>KONAMI ID → <strong>Settings</strong> → <strong>Update Email Address</strong></li>
              <li>
                Yangi email sifatida{' '}
                <button type="button" onClick={() => copy(email)} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-bold" aria-label={`${email} manzilini nusxalash`}>
                  {email} <Copy className="h-3.5 w-3.5" aria-hidden />
                </button>{' '}
                ni yozing
              </li>
              <li>Konami shu manzilga 6 xonali kod yuboradi — u pastda chiqadi. Kodni Konami’ga kiriting.</li>
            </ol>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3 sm:rounded-2xl sm:px-5 sm:py-4">
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Konami kodi</span>
                {view.codeShown ? (
                  <span className="text-3xl font-extrabold tracking-[0.2em] tabular-nums sm:text-4xl">{view.codeShown}</span>
                ) : (
                  <span className="inline-flex items-center gap-2 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Kod kutilmoqda…
                  </span>
                )}
              </div>
              {view.codeShown && (
                <button type="button" onClick={() => copy(view.codeShown!)} className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm font-bold">
                  Nusxalash
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => markEmailChanged(session.id))}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-base font-extrabold text-white disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Emailni o‘zgartirdim
              </button>
              <CancelButton sessionId={session.id} onDone={() => setSession({ ...session, state: 'CANCELLED' })} />
            </div>
          </>
        )}

        {session?.state === 'WAIT_RESET' && view && (
          <>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
              <li>Pastdagi tugma Konami’ning Forgot password sahifasini ochadi — manzil o‘zi yozilgan bo‘ladi</li>
              <li><strong>{email}</strong> ekanini tekshirib, yuboring</li>
            </ol>
            <a
              href={konamiForgotPasswordUrl(email)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-xl bg-primary px-6 text-base font-extrabold text-white transition hover:opacity-90"
            >
              Forgot password sahifasini ochish
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
            <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
              {view.body}
            </p>
            <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-border p-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary dark:text-foreground" aria-hidden />
              <span className="text-sm font-semibold sm:text-base">Konami xati kutilmoqda…</span>
            </div>
            <CancelButton sessionId={session.id} onDone={() => setSession({ ...session, state: 'CANCELLED' })} />
          </>
        )}

        {session?.state === 'VERIFIED' && view && (
          <div className="flex flex-col items-center gap-3 py-4 text-center sm:gap-4 sm:py-8">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-gold to-[#b8860b] text-[#1a1400] sm:h-24 sm:w-24">
              <Check className="h-8 w-8 sm:h-12 sm:w-12" aria-hidden />
            </span>
            <h1 className="text-xl font-extrabold sm:text-3xl">{view.title}</h1>
            <p className="max-w-md text-sm text-muted-foreground sm:text-base">
              Akkount endi <strong className="text-foreground">{email}</strong> ga ulangan va tasdiqlangan. Email akkountlarim bo‘limiga avtomatik yozildi.
            </p>
            {needsResync && (
              <button
                type="button"
                onClick={() => republishSession(session.id).then(() => {
                  setNeedsResync(false);
                  toast.success('Qayta yuborildi — bir necha soniyada akkountda ko‘rinadi');
                }, fail)}
                className="min-h-11 rounded-lg border border-border px-4 text-sm font-bold"
              >
                Qayta sinxronlash
              </button>
            )}
            <Link href="/profile?tab=accounts" className="inline-flex min-h-12 items-center rounded-xl bg-primary px-6 text-base font-extrabold text-white">
              Akkountlarimga
            </Link>
          </div>
        )}

        {session?.state === 'EXPIRED' && view && (
          <>
            <h1 className="text-lg font-extrabold sm:text-2xl">{view.title}</h1>
            <p className="text-sm text-muted-foreground sm:text-base">{view.body}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => retrySession(session.id))}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-base font-extrabold text-white disabled:opacity-50"
              >
                Qayta urinish
              </button>
              <CancelButton sessionId={session.id} onDone={() => setSession({ ...session, state: 'CANCELLED' })} />
            </div>
          </>
        )}

        {session?.state === 'CANCELLED' && (
          <>
            <h1 className="text-lg font-extrabold sm:text-2xl">Bekor qilindi</h1>
            <p className="text-sm text-muted-foreground">Akkount va quti o‘zgarmadi.</p>
            <button
              type="button"
              onClick={() => setSession(null)}
              className="inline-flex min-h-12 items-center self-start rounded-xl bg-primary px-6 text-base font-extrabold text-white"
            >
              Qaytadan boshlash
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function CancelButton({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        cancelSession(sessionId).then(onDone, () => toast.error('Bekor qilinmadi')).finally(() => setBusy(false));
      }}
      className="min-h-12 rounded-xl border border-border px-5 text-sm font-semibold text-muted-foreground disabled:opacity-50"
    >
      Bekor qilish
    </button>
  );
}
