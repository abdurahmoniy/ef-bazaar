'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatListingDate } from '@/lib/marketplace-format';
import { formatTiyin } from '@/lib/money';
import type { ObservationResponse } from '@/lib/payment-types';
import { reviewIgnoreDraft, reviewResolveDraft } from '@/lib/unmatched-resolve';

interface UnmatchedRowProps {
  item: ObservationResponse;
  busy: boolean;
  onResolve: (userId: string, note: string) => void;
  onIgnore: (note?: string) => void;
}

/**
 * One payment the matcher could not attribute, and the two things an admin may
 * do with it.
 *
 * Attributing is the only action in this platform that mints wallet balance,
 * and it cannot be undone — see `unmatched-resolve.ts`. Hence the two gates:
 * the id must be a well-formed UUID before the button lives at all, and the
 * amount *and the target id* are repeated in a confirm step, because the id is
 * the half that can silently be wrong.
 *
 * `rawText` is the Telegram message. It carries a card tail only, never a full
 * PAN — render it, never parse it, never log it.
 */
export function UnmatchedRow({ item, busy, onResolve, onIgnore }: UnmatchedRowProps) {
  const [mode, setMode] = useState<'none' | 'resolve' | 'ignore'>('none');
  const [confirming, setConfirming] = useState(false);
  const [userId, setUserId] = useState('');
  const [note, setNote] = useState('');
  const [ignoreNote, setIgnoreNote] = useState('');

  const resolve = reviewResolveDraft({ userId, note });
  const ignore = reviewIgnoreDraft(ignoreNote);

  function close() {
    setMode('none');
    setConfirming(false);
  }

  return (
    <article className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xl font-black tabular-nums text-foreground">
          {formatTiyin(item.amountTiyin)} so&apos;m
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono">•••• {item.cardLast4}</span>
          {' · '}
          {formatListingDate(item.observedAt)}
        </p>
      </header>

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-muted-foreground">
          Telegram xabari
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {item.rawText}
        </pre>
      </details>

      {mode === 'none' && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={() => setMode('resolve')}
            className="min-h-11"
          >
            Foydalanuvchiga biriktirish
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setMode('ignore')}
            className="min-h-11"
          >
            E&apos;tiborsiz qoldirish
          </Button>
        </div>
      )}

      {mode === 'resolve' && !confirming && (
        <form
          className="space-y-3 rounded-lg border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (resolve.canSubmit) setConfirming(true);
          }}
        >
          <p className="text-sm font-semibold text-foreground">
            Kimga biriktiriladi?
          </p>
          <p className="text-xs text-muted-foreground">
            Bu amalni ortga qaytarib bo&apos;lmaydi — pul darhol o&apos;sha
            foydalanuvchining hisobiga tushadi.
          </p>

          <div>
            <label htmlFor={`resolve-user-${item.id}`} className="sr-only">
              Foydalanuvchi ID
            </label>
            <Input
              id={`resolve-user-${item.id}`}
              autoComplete="off"
              spellCheck={false}
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="Foydalanuvchi ID (UUID)"
              className="font-mono text-sm"
            />
            {resolve.userIdMessage && (
              <p className="mt-1 text-xs font-semibold text-destructive">
                {resolve.userIdMessage}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`resolve-note-${item.id}`} className="sr-only">
              Izoh
            </label>
            <Textarea
              id={`resolve-note-${item.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Izoh — nima uchun biriktirilyapti (majburiy)"
              className="min-h-20 text-sm"
            />
            {resolve.noteMessage && (
              <p className="mt-1 text-xs font-semibold text-destructive">{resolve.noteMessage}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !resolve.canSubmit} className="min-h-11">
              Davom etish
            </Button>
            <Button type="button" variant="ghost" onClick={close} className="min-h-11">
              Bekor qilish
            </Button>
          </div>
        </form>
      )}

      {mode === 'resolve' && confirming && resolve.request && (
        <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-black text-destructive">Tasdiqlang — ortga qaytarib bo&apos;lmaydi</p>
          <dl className="space-y-1 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Summa</dt>
              <dd className="font-black tabular-nums text-foreground">
                {formatTiyin(item.amountTiyin)} so&apos;m
              </dd>
            </div>
            {/* The id is the half that can be silently wrong: a well-formed but
                mistaken UUID opens a wallet for a stranger. Show what will
                actually be sent. */}
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Foydalanuvchi</dt>
              <dd className="break-all font-mono text-xs text-foreground">
                {resolve.request.userId}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Izoh</dt>
              <dd className="break-words text-right text-foreground">{resolve.request.note}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => onResolve(resolve.request!.userId, resolve.request!.note)}
              className="min-h-11"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Tasdiqlayman, biriktirilsin
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="min-h-11"
            >
              Orqaga
            </Button>
          </div>
        </div>
      )}

      {mode === 'ignore' && (
        <form
          className="space-y-3 rounded-lg border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (ignore.canSubmit) onIgnore(ignore.note);
          }}
        >
          <p className="text-sm font-semibold text-foreground">E&apos;tiborsiz qoldirilsinmi?</p>
          <div>
            <label htmlFor={`ignore-note-${item.id}`} className="sr-only">
              Izoh
            </label>
            {/* Optional on purpose: dismissing mints nothing. */}
            <Textarea
              id={`ignore-note-${item.id}`}
              value={ignoreNote}
              onChange={(event) => setIgnoreNote(event.target.value)}
              placeholder="Izoh (ixtiyoriy)"
              className="min-h-20 text-sm"
            />
            {ignore.noteMessage && (
              <p className="mt-1 text-xs font-semibold text-destructive">{ignore.noteMessage}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="outline"
              disabled={busy || !ignore.canSubmit}
              className="min-h-11"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              E&apos;tiborsiz qoldirish
            </Button>
            <Button type="button" variant="ghost" onClick={close} className="min-h-11">
              Bekor qilish
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}
