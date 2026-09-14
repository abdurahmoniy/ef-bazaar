'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Link2Off, Loader2, Search, UserRoundPlus } from 'lucide-react';

import {
  detachMailboxAction,
  reassignMailboxAction,
  searchMailboxUsersAction,
  type MailboxUserOption,
} from '@/app/admin/mailboxes/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Mode = 'idle' | 'detach' | 'reassign';

/**
 * Detach a mailbox from its owner, or hand it to someone else.
 *
 * <p>Both change who can read the box, and both rotate its password, so each
 * asks first and says so. A box in a live trade is refused by trade-service;
 * that refusal is shown rather than guessed at here, because only the server
 * knows which trades are still running.
 */
export function MailboxOwnerActions({
  mailboxId,
  email,
  ownerUserId,
  ownerName,
  deletedAt,
}: {
  mailboxId: string;
  email: string;
  ownerUserId: string | null;
  ownerName: string | null;
  deletedAt: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MailboxUserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<MailboxUserOption | null>(null);

  // Debounced: one request once typing pauses, and a late answer for an older
  // query never overwrites a newer one.
  useEffect(() => {
    if (mode !== 'reassign') return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      setSearching(true);
      searchMailboxUsersAction(q)
        .then((found) => {
          if (!stale) setResults(found.filter((user) => user.id !== ownerUserId));
        })
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, mode, ownerUserId]);

  if (deletedAt) return null;

  function reset() {
    setMode('idle');
    setQuery('');
    setResults([]);
    setPicked(null);
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startSaving(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "O'zgartirib bo'lmadi");
        return;
      }
      reset();
      router.refresh();
    });
  }

  if (mode === 'detach') {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
        <p className="font-semibold text-foreground">
          <span className="font-mono">{email}</span> {ownerName ?? 'egasi'}dan uzilsinmi?
        </p>
        <p className="text-xs text-muted-foreground">
          Pochtaga kirish darhol yopiladi va paroli almashtiriladi.
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={saving}>
            Bekor
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={saving}
            onClick={() => run(() => detachMailboxAction(mailboxId))}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ha, uz
          </Button>
        </div>
        {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
      </div>
    );
  }

  if (mode === 'reassign') {
    return (
      <div className="w-full max-w-md space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
        {picked ? (
          <>
            <p className="font-semibold text-foreground">
              <span className="font-mono">{email}</span> →{' '}
              <span className="font-black">{picked.displayName}</span>
              {picked.telegramUsername && (
                <span className="text-muted-foreground"> @{picked.telegramUsername}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {ownerName ? `${ownerName} kirishni yo'qotadi. ` : ''}Paroli almashtiriladi — yangi
              parolni &quot;Parolni ko&apos;rsatish&quot; orqali olasiz.
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(null)} disabled={saving}>
                Orqaga
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => run(() => reassignMailboxAction(mailboxId, picked.id))}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ha, ulash
              </Button>
            </div>
          </>
        ) : (
          <>
            <label className="relative block">
              <span className="sr-only">Foydalanuvchini qidirish</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ism, username yoki email"
                className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </label>
            {searching && <p className="text-xs text-muted-foreground">Qidirilmoqda…</p>}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <p className="text-xs text-muted-foreground">Hech kim topilmadi.</p>
            )}
            {results.length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {results.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(user)}
                      className="block w-full px-3 py-2 text-left transition hover:bg-muted/50"
                    >
                      <span className="block text-sm font-bold text-foreground">{user.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[user.telegramUsername && `@${user.telegramUsername}`, user.email]
                          .filter(Boolean)
                          .join(' · ') || user.id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Bekor
            </Button>
          </>
        )}
        {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setMode('reassign')}>
        <UserRoundPlus className="mr-2 h-4 w-4" />
        {ownerUserId ? 'Boshqasiga ulash' : 'Foydalanuvchiga ulash'}
      </Button>
      {ownerUserId && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMode('detach')}
          className={cn('text-destructive hover:text-destructive')}
        >
          <Link2Off className="mr-2 h-4 w-4" />
          Uzish
        </Button>
      )}
    </div>
  );
}
