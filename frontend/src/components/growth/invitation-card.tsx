'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Gift, X } from 'lucide-react';
import { GrowthLink } from './growth-link';
import { trackGrowth } from '@/lib/growth-analytics';
import { cn } from '@/lib/utils';

const DISMISSED_KEY = 'efbazaar:invite-promotion-dismissed';
const DEFAULT_DESCRIPTION = 'Do‘stlaringizga efBazaar’ni tavsiya qiling. Taklif shartlari va mukofotlarni ko‘ring.';

interface InvitationCardProps {
  placement: string;
  compact?: boolean;
  dismissible?: boolean;
  title?: string;
  description?: string;
}

export function InvitationCard({
  placement,
  compact = false,
  dismissible = false,
  title = 'Do‘st taklif qiling',
  description = DEFAULT_DESCRIPTION,
}: InvitationCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(!dismissible);
  const element = useRef<HTMLElement>(null);

  useEffect(() => {
    if (dismissible) {
      try { setDismissed(sessionStorage.getItem(DISMISSED_KEY) === '1'); } catch { /* Storage is optional. */ }
    }
    setReady(true);
  }, [dismissible]);

  const visible = ready && (!dismissible || !dismissed);
  useEffect(() => {
    if (!visible || !element.current) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        trackGrowth('invite_impression', { placement });
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [visible, placement]);

  if (!visible) return null;
  return (
    <section ref={element} aria-label="Do‘st taklif qilish" className={cn(
      'relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5',
      compact ? 'p-3 sm:p-4' : 'p-4 sm:p-5',
    )}>
      {dismissible && (
        <button type="button" aria-label="Taklif eslatmasini yopish"
          className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-xl text-muted-foreground transition hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            try { sessionStorage.setItem(DISMISSED_KEY, '1'); } catch { /* Still dismiss locally. */ }
            setDismissed(true);
            trackGrowth('invite_dismiss', { placement });
          }}><X aria-hidden className="h-4 w-4" /></button>
      )}
      <div className={cn('flex gap-3', compact && 'sm:items-center', dismissible && 'pr-7')}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Gift aria-hidden className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold leading-snug text-foreground">{title}</h2>
          <p className={cn('mt-1 leading-relaxed text-muted-foreground', compact ? 'text-xs sm:text-sm' : 'text-sm')}>
            {compact && description === DEFAULT_DESCRIPTION
              ? 'Havolangizni yuboring. Mukofot shartlarini ko‘ring.' : description}
          </p>
        </div>
        <GrowthLink href="/invite" event="invite_open" placement={placement}
          className={cn('hidden min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', compact && 'sm:inline-flex')}>
          Taklif qilish <ArrowRight aria-hidden className="h-4 w-4" />
        </GrowthLink>
      </div>
      <GrowthLink href="/invite" event="invite_open" placement={placement}
        className={cn('mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', compact && 'sm:hidden')}>
        Taklif qilish <ArrowRight aria-hidden className="h-4 w-4" />
      </GrowthLink>
    </section>
  );
}
