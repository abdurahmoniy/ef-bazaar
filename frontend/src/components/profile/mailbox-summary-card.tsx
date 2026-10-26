'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { fetchSlotStatus, type MailboxSlotStatus } from '@/lib/mailbox-slots';
import { siteConfig } from '@/lib/site';

export function MailboxSummaryCard() {
  const [status, setStatus] = useState<MailboxSlotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetchSlotStatus().then((value) => {
      if (!active) return;
      setStatus(value);
      setLoading(false);
    });
    return () => { active = false; };
  }, [attempt]);

  return (
    <section aria-label="Pochta qutilari" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Mail aria-hidden className="h-4 w-4 text-muted-foreground" />Pochta qutilari
        </h2>
        {loading ? (
          <p role="status" className="text-xs text-muted-foreground">Yuklanmoqda…</p>
        ) : status === null ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs text-muted-foreground">Pochta holati yuklanmadi</p>
            <button type="button" className="min-h-11 text-xs font-medium underline underline-offset-4" onClick={() => { setLoading(true); setAttempt(value => value + 1); }}>Qayta urinish</button>
          </div>
        ) : status.plan !== 'STAFF' ? (
          <p className="text-sm tabular-nums text-muted-foreground">Jami: {status.totalUsed} / {status.totalLimit === null ? 'cheksiz' : status.totalLimit}</p>
        ) : null}
      </div>
      <Button asChild variant="outline" className="min-h-11 rounded-full">
        <Link href={siteConfig.mailUrl}>Pochtani ochish<ArrowUpRight aria-hidden className="h-4 w-4" /></Link>
      </Button>
    </section>
  );
}
