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

export const TOOLBAR_MENU_VIEWPORT_CLASSNAME =
  'max-h-[min(18rem,calc(var(--tg-viewport-height,100dvh)-var(--marketplace-bottom-bar-height)-var(--marketplace-sticky-height)-1rem))] overflow-y-auto [@media(max-height:32rem)]:fixed [@media(max-height:32rem)]:left-4 [@media(max-height:32rem)]:right-4 [@media(max-height:32rem)]:top-[calc(var(--marketplace-sticky-height)+0.5rem)] [@media(max-height:32rem)]:bottom-[calc(var(--marketplace-bottom-bar-height)+0.5rem)] [@media(max-height:32rem)]:w-auto [@media(max-height:32rem)]:max-h-none';

export function useToolbarMenuKeyboardNavigation({
  open,
  activeIndex,
  itemCount,
  setOpen,
}: {
  open: boolean;
  activeIndex: number;
  itemCount: number;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const itemRefs = React.useRef<Array<HTMLAnchorElement | null>>([]);

  const close = React.useCallback((restoreTriggerFocus = false) => {
    setOpen(false);
    if (restoreTriggerFocus) triggerRef.current?.focus();
  }, [setOpen]);

  React.useEffect(() => {
    if (!open || itemCount === 0) return;
    const index = Math.min(Math.max(activeIndex, 0), itemCount - 1);
    itemRefs.current[index]?.focus();
  }, [activeIndex, itemCount, open]);

  const onMenuKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }

    const items = itemRefs.current
      .slice(0, itemCount)
      .filter((item): item is HTMLAnchorElement => item !== null);
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLAnchorElement);
    let nextIndex: number;
    if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    items[nextIndex]?.focus();
  }, [close, itemCount, setOpen]);

  return { close, itemRefs, onMenuKeyDown, triggerRef };
}

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
  const activeIndex = VIEW_OPTIONS.findIndex((option) => option.value === active.value);
  const menuId = `${viewLayerId}-menu`;
  const menuNavigation = useToolbarMenuKeyboardNavigation({
    open,
    activeIndex,
    itemCount: VIEW_OPTIONS.length,
    setOpen,
  });

  useTelegramBackLayer({
    id: viewLayerId,
    kind: 'overlay',
    onBack: () => menuNavigation.close(true),
    lockVerticalSwipes: false,
  }, open);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={menuNavigation.triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Ko‘rinish: ${active.label}`}
        className="tap-press inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-card transition hover:border-primary/40"
      >
        <ViewIcon view={view} />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Natijalar ko‘rinishi"
          onKeyDown={menuNavigation.onMenuKeyDown}
          className={cn(
            'absolute right-0 top-12 z-40 w-44 origin-top-right animate-menu-in rounded-xl border border-border bg-card p-1.5 shadow-card-hover',
            TOOLBAR_MENU_VIEWPORT_CLASSNAME,
          )}
        >
          {VIEW_OPTIONS.map((option, index) => {
            const isActive = option.value === view;
            const href = marketplaceHref(setMarketplaceView(
              new URLSearchParams(rawQuery),
              option.value,
            ));
            return (
              <MarketplacePendingLink
                ref={(node) => { menuNavigation.itemRefs.current[index] = node; }}
                key={option.value}
                href={href}
                role="menuitemradio"
                aria-checked={isActive}
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
