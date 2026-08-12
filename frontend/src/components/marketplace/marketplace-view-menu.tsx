'use client';

import { Check, LayoutGrid, List, PanelsTopLeft } from 'lucide-react';
import * as React from 'react';

import { MarketplacePendingLink } from '@/components/marketplace/marketplace-navigation';
import { useTelegramBackLayer } from '@/components/telegram/telegram-back-provider';
import {
  marketplaceHref,
  setMarketplaceView,
  type MarketplaceView,
} from '@/lib/marketplace-query';
import { cn } from '@/lib/utils';

const VIEW_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'list', label: 'Ro‘yxat' },
  { value: 'grid', label: 'Katak' },
] as const;

export function marketplaceViewOptions() {
  return VIEW_OPTIONS.map((option) => ({ ...option }));
}

function ViewIcon({ view }: { view: MarketplaceView }) {
  if (view === 'list') return <List className="h-4 w-4" aria-hidden />;
  if (view === 'grid') return <LayoutGrid className="h-4 w-4" aria-hidden />;
  return <PanelsTopLeft className="h-4 w-4" aria-hidden />;
}

export function MarketplaceViewMenu({
  rawQuery,
  view,
}: {
  rawQuery: string;
  view: MarketplaceView;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const viewLayerId = React.useId();
  const active = VIEW_OPTIONS.find((option) => option.value === view) ?? VIEW_OPTIONS[0];

  useTelegramBackLayer({
    id: viewLayerId,
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
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Ko‘rinish: ${active.label}`}
        className="tap-press inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-card transition hover:border-primary/40"
      >
        <ViewIcon view={view} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Natijalar ko‘rinishi"
          className="absolute right-0 top-12 z-40 w-44 origin-top-right animate-menu-in rounded-xl border border-border bg-card p-1.5 shadow-card-hover"
        >
          {VIEW_OPTIONS.map((option) => {
            const isActive = option.value === view;
            const href = marketplaceHref(setMarketplaceView(
              new URLSearchParams(rawQuery),
              option.value,
            ));
            return (
              <MarketplacePendingLink
                key={option.value}
                href={href}
                role="menuitem"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition hover:bg-accent/60',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <ViewIcon view={option.value} />
                <span className="flex-1">{option.label}</span>
                <Check className={cn('h-4 w-4', !isActive && 'invisible')} aria-hidden />
              </MarketplacePendingLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
