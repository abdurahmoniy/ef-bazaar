'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronRight, Crown, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import {
  claimView,
  DEFAULT_DOMAIN,
  efootballOffer,
  isPremiumDomainPlan,
  localPartProblem,
  normalizeLocalPart,
  PREMIUM_DOMAIN,
  type Availability,
} from '@/lib/custom-mailbox';
import { checkAvailability, claimCustomMailbox, MailboxApiError } from '@/lib/custom-mailbox-client';
import { PLAN_NAMES, type PlanCode } from '@/lib/plans';
import { cn } from '@/lib/utils';

interface CustomClaimProps {
  /** Null when the plan could not be loaded — treated like Jaydari for offers. */
  plan: PlanCode | null;
  /** Account the user came from; linking preselects it. */
  accountId: string | null;
}

const DOMAINS = [DEFAULT_DOMAIN, PREMIUM_DOMAIN];

export function CustomClaim({ plan, accountId }: CustomClaimProps) {
  const router = useRouter();
  const premium = isPremiumDomainPlan(plan);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState(DEFAULT_DOMAIN);
  const [result, setResult] = useState<Availability | null>(null);
  const [checking, setChecking] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [recheck, setRecheck] = useState(0);
  const pending = useRef<AbortController | null>(null);

  const local = normalizeLocalPart(name);

  // Ask once the user stops typing; a newer keystroke cancels the older request.
  useEffect(() => {
    pending.current?.abort();
    setResult(null);
    if (!local || localPartProblem(local)) {
      setChecking(false);
      return;
    }
    setChecking(true);
    const controller = new AbortController();
    pending.current = controller;
    const timer = setTimeout(() => {
      checkAvailability(local, domain, controller.signal)
        .then((r) => {
          if (!controller.signal.aborted) setResult(r);
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setChecking(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [local, domain, recheck]);

  const view = claimView({ localPart: local, checking, result, plan });
  const offer = view.tone === 'ok' ? efootballOffer(plan, local) : null;
  const email = `${local}@${domain}`;

  async function claim() {
    setClaiming(true);
    try {
      const box = await claimCustomMailbox(local, domain);
      toast.success(`${box.email} sizniki — endi akkount ulaymiz`);
      router.push(`/mailboxes/custom/${box.id}/link${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`);
    } catch (error) {
      const message = error instanceof MailboxApiError ? error.message : 'Quti olinmadi, qayta urinib ko‘ring';
      toast.error(message);
      // The name may have just been taken: ask again.
      setRecheck((n) => n + 1);
    } finally {
      setClaiming(false);
    }
  }

  const planLine = plan === null || plan === 'STANDARD'
    ? 'Jaydari · custom slot yo‘q'
    : plan === 'STAFF' ? 'Admin · cheklovsiz' : `${PLAN_NAMES[plan]} tarifi`;

  return (
    <section
      aria-labelledby="custom-pick-title"
      className={cn(
        'flex flex-col gap-3 rounded-2xl border-2 bg-card p-4 shadow-sm sm:gap-5 sm:rounded-3xl sm:p-8',
        view.action.kind === 'claim' ? 'gold-ring' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="custom-pick-title" className="text-base font-bold sm:text-lg">Manzil nomini tanlang</h2>
        <span className="inline-flex min-h-7 items-center rounded-full bg-muted px-3 text-xs font-semibold text-primary dark:text-foreground sm:text-sm">
          {planLine}
        </span>
      </div>

      {premium && (
        <div role="radiogroup" aria-label="Domen" className="inline-flex self-start gap-1 rounded-xl bg-muted p-1">
          {DOMAINS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={d === domain}
              onClick={() => setDomain(d)}
              className={cn(
                'min-h-11 rounded-lg px-4 text-sm font-bold transition',
                d === domain ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              @{d}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="custom-local" className="text-sm font-semibold text-muted-foreground">
          Manzil nomi
        </label>
        <div
          className={cn(
            'flex items-stretch overflow-hidden rounded-xl border-2 bg-background sm:rounded-2xl',
            view.tone === 'ok' ? 'border-emerald-600 dark:border-emerald-400'
              : view.tone === 'bad' ? 'border-destructive' : 'border-border',
          )}
        >
          <input
            id="custom-local"
            value={name}
            onChange={(e) => setName(e.target.value.replace(/\s/g, ''))}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            maxLength={24}
            placeholder="nomingiz"
            aria-describedby="custom-status"
            className="h-12 min-w-0 flex-1 bg-transparent px-3 text-lg font-bold outline-none placeholder:font-medium placeholder:text-muted-foreground sm:h-[72px] sm:px-5 sm:text-3xl"
          />
          <span className="flex items-center whitespace-nowrap bg-muted px-3 text-sm font-semibold text-muted-foreground sm:px-5 sm:text-2xl">
            @{domain}
          </span>
        </div>
        <div
          id="custom-status"
          role="status"
          aria-live="polite"
          className={cn(
            'flex min-h-6 items-center gap-2 text-sm font-semibold sm:text-base',
            view.tone === 'ok' && 'text-emerald-700 dark:text-emerald-400',
            view.tone === 'bad' && 'text-destructive',
            view.tone === 'checking' && 'text-muted-foreground',
          )}
        >
          {view.tone === 'ok' && <Check className="h-4 w-4" aria-hidden />}
          {view.tone === 'checking' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          <span>{view.message}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        {view.action.kind === 'claim' && (
          <button
            type="button"
            onClick={claim}
            disabled={claiming}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-extrabold text-white transition hover:opacity-90 disabled:opacity-60 sm:min-h-14 sm:rounded-2xl"
          >
            {claiming ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4 text-gold" aria-hidden />}
            Olish
            <span className="hidden font-semibold sm:inline">— {email}</span>
          </button>
        )}
        {view.action.kind === 'upgrade' && (
          <Link
            href="/plans"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-extrabold text-white transition hover:opacity-90 sm:min-h-14 sm:rounded-2xl"
          >
            <ArrowUp className="h-4 w-4 text-gold" aria-hidden />
            {view.action.label}
          </Link>
        )}
        <span className="text-xs text-muted-foreground sm:text-sm">
          5–24 belgi, lotin harf va raqam. Nom keyin o‘zgartirilmaydi.
        </span>
      </div>

      {offer && (
        <Link
          href="/plans"
          className="flex min-h-[52px] items-center gap-3 rounded-xl border border-gold-border bg-card px-3 py-2 text-foreground transition hover:bg-muted sm:rounded-2xl sm:px-5 sm:py-4"
        >
          <span className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-soft text-gold-foreground sm:grid">
            <Crown className="h-5 w-5" aria-hidden />
          </span>
          <Crown className="h-4 w-4 shrink-0 text-gold-foreground sm:hidden" aria-hidden />
          <span className="min-w-0 flex-1 text-sm leading-snug sm:text-base">
            <strong>{offer.split(' ')[0]}</strong> {offer.split(' ').slice(1).join(' ')}
            <span className="block text-xs text-muted-foreground sm:text-sm">efootball.uz domeni faqat Aristokrat tarifida</span>
          </span>
          <span className="hidden min-h-11 items-center rounded-xl bg-gold-soft px-4 text-sm font-extrabold text-gold-foreground sm:inline-flex">
            Aristokrat
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground sm:hidden" aria-hidden />
        </Link>
      )}
    </section>
  );
}
