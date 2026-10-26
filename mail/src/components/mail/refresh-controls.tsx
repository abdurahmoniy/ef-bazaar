'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';

import { cn } from '@/lib/utils';

const AUTO_INTERVAL_MS = 30_000;
const AUTO_PREF_KEY = 'efb-mail-auto-refresh';

/**
 * Manual refresh + opt-out auto-refresh for the inbox. The primary use case
 * of this app is "waiting for a Konami reset / 2FA mail", so the inbox polls
 * `router.refresh()` every 30s by default — but only while the tab is
 * visible, so a backgrounded phone doesn't burn the rate-limit budget.
 * Preference persists in localStorage.
 */
export function RefreshControls() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (localStorage.getItem(AUTO_PREF_KEY) === 'off') setAuto(false);
  }, []);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      if (!document.hidden) refresh();
    }, AUTO_INTERVAL_MS);
    return () => clearInterval(id);
  }, [auto, refresh]);

  const toggleAuto = () => {
    setAuto((prev) => {
      localStorage.setItem(AUTO_PREF_KEY, prev ? 'off' : 'on');
      return !prev;
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={toggleAuto}
        title={
          auto
            ? 'Avto-yangilash yoniq — har 30 soniyada tekshiradi'
            : 'Avto-yangilash o\'chiq'
        }
        aria-pressed={auto}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors',
          auto
            ? 'border-primary/30 bg-primary/10 text-primary'
            : 'border-border bg-card text-muted-foreground hover:bg-muted',
        )}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            auto ? 'animate-pulse bg-ring' : 'bg-muted-foreground/40',
          )}
          aria-hidden
        />
        Jonli
      </button>
      <button
        type="button"
        onClick={refresh}
        disabled={isPending}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
      >
        <RotateCw className={cn('h-3.5 w-3.5', isPending && 'animate-spin')} />
        Yangilash
      </button>
    </div>
  );
}
