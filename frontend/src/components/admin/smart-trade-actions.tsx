'use client';

import { CheckCircle2, KeyRound, MailCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  ACTION_LABEL_UZ,
  ROLE_LABEL_UZ,
  isValidCode,
  isValidLoginCode,
  sideDone,
} from '@/lib/smart-trade-admin';
import type { SmartTradeAction, SmartTradeSide } from '@/lib/smart-trade-admin-types';
import { buildTradeApiPath } from '@/lib/trade-client-api';
import type { ParticipantRole } from '@/lib/trade-types';
import { cn } from '@/lib/utils';

interface SmartTradeActionsProps {
  tradeId: string;
  action: SmartTradeAction;
  /** Only the sides that have an escrow mailbox. */
  sides: SmartTradeSide[];
  /** The party whose mailbox is open on the right — the natural default. */
  selectedRole: ParticipantRole | null;
}

/**
 * The one manual step the trade is waiting on, and nothing else.
 *
 * The backend refuses the step if the trade has moved on (409), so a stale page
 * cannot push a trade anywhere — the admin just sees why and the page reloads.
 */
export function SmartTradeActions({ tradeId, action, sides, selectedRole }: SmartTradeActionsProps) {
  const router = useRouter();
  const [role, setRole] = useState<ParticipantRole | null>(selectedRole ?? sides[0]?.role ?? null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (action === 'NONE') {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Bu bosqichda smart admin qo&apos;lda kiritiladigan qiymat kutmayapti.
      </p>
    );
  }

  if (sides.length === 0 || role === null) {
    return (
      <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Savdoda hali pochta qutisi yo&apos;q.
      </p>
    );
  }

  async function submit() {
    if (role === null) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const endpoint = action === 'EMAIL_CHANGE_CODE'
      ? 'email-change-code'
      : action === 'LOGIN_CODE'
        ? 'login-code'
        : 'konami-email-confirm';
    const path = ['v1', 'admin', 'smart-trades', tradeId, endpoint];
    const body = action === 'KONAMI_EMAIL_CONFIRM' ? { role } : { role, code: code.trim() };
    const result = await postJson(buildTradeApiPath(path), body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      // A 409 means the trade moved on; show the new state rather than a
      // form for a step that no longer exists.
      router.refresh();
      return;
    }
    setDone(action === 'KONAMI_EMAIL_CONFIRM'
      ? 'Tasdiqlandi.'
      : 'Kod saqlandi va tomonga ko‘rsatildi.');
    setCode('');
    router.refresh();
  }

  const current = sides.find((side) => side.role === role);
  const alreadyDone = current ? sideDone(current, action) : false;
  const canSubmit = !busy
    && (action === 'KONAMI_EMAIL_CONFIRM'
      || (action === 'EMAIL_CHANGE_CODE' ? isValidCode(code) : isValidLoginCode(code)));

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-black text-foreground">
        {action === 'EMAIL_CHANGE_CODE'
          ? <KeyRound className="h-4 w-4" aria-hidden="true" />
          : <MailCheck className="h-4 w-4" aria-hidden="true" />}
        {ACTION_LABEL_UZ[action]}
      </h3>

      {sides.length > 1 && (
        <div className="flex gap-2" role="group" aria-label="Tomon">
          {sides.map((side) => (
            <button
              key={side.role}
              type="button"
              aria-pressed={side.role === role}
              onClick={() => setRole(side.role)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition',
                side.role === role
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-foreground hover:bg-muted',
              )}
            >
              {ROLE_LABEL_UZ[side.role]}
              {sideDone(side, action) && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}

      {current?.mailboxEmail && (
        <p className="text-xs text-muted-foreground">
          Pochta: <span className="font-mono text-foreground">{current.mailboxEmail}</span>
        </p>
      )}

      {action === 'LOGIN_CODE' && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          Favqulodda yo&apos;l. Odatda kodni smart admin o&apos;zi o&apos;qib beradi — bu yerga
          faqat kod kelmay qolganda qo&apos;l uriladi. Kodni o&apos;ng tarafdagi pochtadan
          o&apos;qing: u akkountni OLAYOTGAN tomonga ko&apos;rsatiladi.
        </p>
      )}

      {alreadyDone && (
        <p className="text-xs font-semibold text-muted-foreground">
          {action === 'LOGIN_CODE'
            ? `Bu tomonga kod berilgan: ${current?.loginCode}. Yangisini kiritsangiz, ustidan yoziladi.`
            : action === 'EMAIL_CHANGE_CODE'
            ? `Bu tomon uchun kod bor: ${current?.emailChangeCode}. Yangisini kiritsangiz, ustidan yoziladi.`
            : 'Bu tomon allaqachon tasdiqlangan.'}
        </p>
      )}

      {action !== 'KONAMI_EMAIL_CONFIRM' && (
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">
            {action === 'LOGIN_CODE'
              ? 'Konami kirish kodi (4–8 raqam)'
              : 'Konami xatidagi 6 xonali kod'}
          </span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={action === 'LOGIN_CODE' ? 8 : 6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-lg tracking-widest text-foreground"
            placeholder="000000"
          />
        </label>
      )}

      <Button
        type="button"
        onClick={() => void submit()}
        disabled={!canSubmit || (action === 'KONAMI_EMAIL_CONFIRM' && alreadyDone)}
        className="w-full"
      >
        {action === 'KONAMI_EMAIL_CONFIRM' ? 'Konami xati keldi — tasdiqlash' : 'Kodni saqlash'}
      </Button>

      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      {done && <p role="status" className="text-sm font-semibold text-foreground">{done}</p>}

      <p className="text-xs text-muted-foreground">
        Har bir qo&apos;lda kiritish auditga yoziladi va savdo chatida tizim xabari chiqadi.
      </p>
    </section>
  );
}

async function postJson(
  url: string,
  body: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) return { ok: true };
    try {
      const payload = (await response.json()) as { message?: unknown; error?: unknown };
      if (typeof payload.message === 'string') return { ok: false, error: payload.message };
      if (typeof payload.error === 'string') return { ok: false, error: payload.error };
    } catch {
      // fall through
    }
    return {
      ok: false,
      error: response.status === 409 ? 'Savdo boshqa bosqichga o‘tgan.' : "So'rov bajarilmadi",
    };
  } catch {
    return { ok: false, error: "Trade API bilan aloqa yo'q" };
  }
}
