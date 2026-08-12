'use client';

import * as React from 'react';
import { ArrowUpDown, Check } from 'lucide-react';

import { MarketplacePendingLink } from '@/components/marketplace/marketplace-navigation';
import { useTelegramBackLayer } from '@/components/telegram/telegram-back-provider';
import { cn } from '@/lib/utils';

export interface SortMenuOption {
  id: string;
  label: string;
  href: string;
}

interface SortMenuProps {
  options: SortMenuOption[];
  activeId: string;
  className?: string;
  compact?: boolean;
}

/**
 * Sort control for the results header.
 *
 * Sorting used to be the last field of the filter sidebar — below Yulduz
 * o'yinchi, and on a phone below the fold of a sheet you had to open first.
 * Five useful orderings (cheapest, most liked, newest…) were effectively
 * invisible. It belongs next to the result count, where every catalogue puts
 * it. Links rather than a <select>: each ordering is a real URL, so it is
 * shareable and survives back/forward.
 */
export function SortMenu({ options, activeId, className, compact = false }: SortMenuProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const sortLayerId = React.useId();
  const active = options.find((o) => o.id === activeId) ?? options[0];

  useTelegramBackLayer({
    id: sortLayerId,
    kind: 'overlay',
    onBack: () => setOpen(false),
    lockVerticalSwipes: false,
  }, open);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative min-w-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Saralash: ${active?.label ?? ''}`}
        className={cn(
          'tap-press inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-foreground shadow-card transition hover:border-primary/40',
          compact ? 'px-0' : 'px-3',
        )}
      >
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
        {!compact && <span>{active?.label}</span>}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-12 z-40 w-52 origin-top-right animate-menu-in rounded-xl border border-border bg-card p-1.5 shadow-card-hover min-[360px]:left-auto min-[360px]:right-0"
        >
          {options.map((option) => {
            const isActive = option.id === activeId;
            return (
              <MarketplacePendingLink
                key={option.id}
                href={option.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition hover:bg-accent/60',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <Check className={cn('h-3.5 w-3.5 shrink-0', !isActive && 'invisible')} />
                {option.label}
              </MarketplacePendingLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
