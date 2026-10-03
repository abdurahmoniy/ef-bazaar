'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, SlidersHorizontal, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { ListingFilterFields } from '@/components/marketplace/listing-filter-fields';
import { useMarketplaceNavigation } from '@/components/marketplace/marketplace-navigation';
import { useTelegramBackLayer } from '@/components/telegram/telegram-back-provider';
import { Button } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/use-media-query';
import { formatCompactNumber } from '@/lib/marketplace-format';
import {
  applyMarketplaceFilterDraft,
  filterDraftFromBrowseParams,
  clearMarketplaceFilterDraft,
  validateMarketplaceFilterDraft,
  type MarketplaceFilterDraft,
} from '@/lib/marketplace-filter-draft';
import { useMarketplaceFilterPreview } from '@/hooks/use-marketplace-filter-preview';
import { playerAppliedFilterCount } from '@/lib/marketplace-applied-filters';
import { marketplaceHref } from '@/lib/marketplace-query';
import { getTelegramWebApp } from '@/lib/telegram';
import { telegramHaptic } from '@/lib/telegram-shell';
import type { ListingBrowseParams } from '@/lib/marketplace-types';

interface MarketplaceFilterSheetProps {
  filters: ListingBrowseParams;
  rawQuery: string;
  activeCount: number;
  authenticated?: boolean;
}

export function MarketplaceFilterSheet({
  filters,
  rawQuery,
  activeCount,
  authenticated = false,
}: MarketplaceFilterSheetProps) {
  const router = useRouter();
  const navigation = useMarketplaceNavigation();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<MarketplaceFilterDraft>(
    () => filterDraftFromBrowseParams(filters),
  );
  const filterLayerId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const restoreFocusRef = React.useRef(false);
  const applyStartedRef = React.useRef(false);
  const errors = validateMarketplaceFilterDraft(draft);
  const valid = Object.keys(errors).length === 0;

  const preview = useMarketplaceFilterPreview(rawQuery, draft, open && valid, authenticated);
  const changeDraft = setDraft;

  const close = React.useCallback(() => {
    restoreFocusRef.current = true;
    setOpen(false);
  }, []);

  useTelegramBackLayer({
    id: filterLayerId,
    kind: 'overlay',
    onBack: close,
    lockVerticalSwipes: true,
  }, open);

  React.useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [open]);

  const changeOpen = React.useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setDraft(filterDraftFromBrowseParams(filters));
      applyStartedRef.current = false;
    } else {
      restoreFocusRef.current = true;
    }
    setOpen(nextOpen);
  }, [filters]);

  React.useEffect(() => {
    const handleOpenFilters = () => changeOpen(true);
    const handleHash = () => {
      if (window.location.hash === '#marketplace-filters' || window.location.hash === '#filters') {
        changeOpen(true);
      }
    };
    handleHash();
    window.addEventListener('open-marketplace-filters', handleOpenFilters);
    window.addEventListener('hashchange', handleHash);
    return () => {
      window.removeEventListener('open-marketplace-filters', handleOpenFilters);
      window.removeEventListener('hashchange', handleHash);
    };
  }, [changeOpen]);

  function apply() {
    if (!valid || applyStartedRef.current) return;
    applyStartedRef.current = true;
    const next = applyMarketplaceFilterDraft(new URLSearchParams(rawQuery), draft);
    telegramHaptic(getTelegramWebApp(), 'success', reducedMotion);
    const href = marketplaceHref(next);
    if (navigation) navigation.navigate(href);
    else router.push(href);
    setOpen(false);
  }

  const cta = preview.status === 'success'
    ? `${formatCompactNumber(preview.count)} ta e‘lonni ko‘rsatish`
    : preview.status === 'loading'
      ? 'Hisoblanmoqda'
      : 'Natijalarni ko‘rsatish';

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          className="tap-press min-h-11 shrink-0 rounded-full"
        >
          <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden />
          <span>Filtrlar</span>
          {activeCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out motion-reduce:animate-none" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          className="fixed inset-x-0 top-0 bottom-0 z-50 flex h-[min(100dvh,var(--tg-viewport-height,100dvh))] flex-col overflow-hidden border-border bg-card shadow-2xl outline-none data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down motion-reduce:animate-none lg:hidden"
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-black text-foreground">Filtrlar</Dialog.Title>
              <Dialog.Description className="sr-only">
                Kerakli akkount xususiyatlarini tanlang.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Filtrlarni yopish"
                className="tap-press grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            <ListingFilterFields
              overview
              draft={draft}
              errors={errors}
              onChange={changeDraft}
              playerCount={playerAppliedFilterCount(new URLSearchParams(rawQuery))}
              onOpenPlayers={() => {
                if (!valid) return;
                setOpen(false);
                const params = applyMarketplaceFilterDraft(new URLSearchParams(rawQuery), draft);
                const href = `${marketplaceHref(params)}#marketplace-player-filter`;
                router.push(href);
                window.dispatchEvent(new CustomEvent('open-marketplace-player-filter', { detail: params.toString() }));
              }}
            />
          </div>

          <footer className="flex shrink-0 gap-2 border-t border-border bg-card/95 px-4 pb-[calc(0.75rem+var(--app-content-safe-bottom))] pt-3 backdrop-blur">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => changeDraft(clearMarketplaceFilterDraft())}
            >
              Tozalash
            </Button>
            <Button
              type="button"
              className="min-h-11 flex-1"
              disabled={!valid}
              onClick={apply}
            >
              <span aria-live="polite" className="inline-flex min-h-5 items-center justify-center gap-2">
                {preview.status === 'loading' && (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                )}
                {cta}
              </span>
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
