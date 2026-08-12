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
import { fetchMarketplaceResultCount } from '@/lib/marketplace-preview';
import { marketplaceHref } from '@/lib/marketplace-query';
import { getTelegramWebApp } from '@/lib/telegram';
import { telegramHaptic } from '@/lib/telegram-shell';
import type { ListingBrowseParams } from '@/lib/marketplace-types';

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; count: number }
  | { status: 'error' };

interface MarketplaceFilterSheetProps {
  filters: ListingBrowseParams;
  rawQuery: string;
  activeCount: number;
}

export function MarketplaceFilterSheet({
  filters,
  rawQuery,
  activeCount,
}: MarketplaceFilterSheetProps) {
  const router = useRouter();
  const navigation = useMarketplaceNavigation();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<MarketplaceFilterDraft>(
    () => filterDraftFromBrowseParams(filters),
  );
  const [preview, setPreview] = React.useState<PreviewState>({ status: 'idle' });
  const filterLayerId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const restoreFocusRef = React.useRef(false);
  const applyStartedRef = React.useRef(false);
  const previewGenerationRef = React.useRef(0);
  const errors = validateMarketplaceFilterDraft(draft);
  const valid = Object.keys(errors).length === 0;

  const changeDraft = React.useCallback((nextDraft: MarketplaceFilterDraft) => {
    previewGenerationRef.current += 1;
    setPreview({ status: 'idle' });
    setDraft(nextDraft);
  }, []);

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
    const generation = previewGenerationRef.current + 1;
    previewGenerationRef.current = generation;
    if (!open || !valid) {
      setPreview({ status: 'idle' });
      return;
    }
    setPreview({ status: 'idle' });
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (previewGenerationRef.current !== generation) return;
      setPreview({ status: 'loading' });
      fetchMarketplaceResultCount(new URLSearchParams(rawQuery), draft, controller.signal)
        .then((count) => {
          if (previewGenerationRef.current === generation) {
            setPreview({ status: 'success', count });
          }
        })
        .catch((error) => {
          if (previewGenerationRef.current === generation
            && (error as Error).name !== 'AbortError') {
            setPreview({ status: 'error' });
          }
        });
    }, 300);
    return () => {
      if (previewGenerationRef.current === generation) {
        previewGenerationRef.current += 1;
      }
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, valid, rawQuery, draft]);

  React.useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [open]);

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setDraft(filterDraftFromBrowseParams(filters));
      setPreview({ status: 'idle' });
      applyStartedRef.current = false;
    } else {
      restoreFocusRef.current = true;
    }
    setOpen(nextOpen);
  }

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
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/55 backdrop-blur-sm motion-reduce:animate-none" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(92dvh,var(--tg-viewport-height,92dvh))] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-card shadow-2xl outline-none motion-reduce:animate-none lg:hidden"
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-black text-foreground">Filtrlar</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
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

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <ListingFilterFields
              draft={draft}
              errors={errors}
              onChange={changeDraft}
              collapsible
            />
          </div>

          <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-border bg-card/95 px-4 pb-[calc(0.75rem+var(--app-content-safe-bottom))] pt-3 backdrop-blur">
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
              className="min-h-11"
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
