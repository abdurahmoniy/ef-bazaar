'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Search, X } from 'lucide-react';

import { useMarketplaceNavigation } from '@/components/marketplace/marketplace-navigation';
import { useTelegramBackLayer } from '@/components/telegram/telegram-back-provider';
import { Input } from '@/components/ui/input';
import {
  initialSearchChromeState,
  reduceSearchChrome,
} from '@/lib/marketplace-search-collapse';
import { marketplaceHref, setMarketplaceSearch } from '@/lib/marketplace-query';
import { cn } from '@/lib/utils';

interface MarketplaceSearchProps {
  rawQuery: string;
  initialQuery?: string;
  collapsible: boolean;
}

const SHORT_LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 480px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function MarketplaceSearch({
  rawQuery,
  initialQuery,
  collapsible,
}: MarketplaceSearchProps) {
  const router = useRouter();
  const marketplaceNavigation = useMarketplaceNavigation();
  const fallbackNavigate = React.useCallback((href: string) => router.push(href), [router]);
  const navigate = marketplaceNavigation?.navigate ?? fallbackNavigate;
  const [value, setValue] = React.useState(initialQuery ?? '');
  const [state, dispatch] = React.useReducer(
    reduceSearchChrome,
    false,
    initialSearchChromeState,
  );
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const searchLayerId = React.useId();
  const phase = collapsible ? state.phase : 'expanded';

  useTelegramBackLayer({
    id: searchLayerId,
    kind: 'overlay',
    onBack: () => dispatch({ type: 'close' }),
    lockVerticalSwipes: false,
  }, collapsible && state.sessionOpen);

  React.useEffect(() => {
    setValue(initialQuery ?? '');
  }, [initialQuery]);

  React.useEffect(() => {
    if (!collapsible) return;

    let frame: number | null = null;
    const onScroll = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        dispatch({ type: 'scroll', y: window.scrollY });
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [collapsible]);

  React.useEffect(() => {
    if (!collapsible) return;
    const media = window.matchMedia(SHORT_LANDSCAPE_QUERY);
    const sync = () => dispatch({ type: 'landscape', short: media.matches });
    sync();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, [collapsible]);

  React.useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => setReducedMotion(media.matches);
    sync();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  React.useEffect(() => {
    if (state.phase === 'collapsing' && reducedMotion) {
      dispatch({ type: 'transitionEnd' });
    }
  }, [reducedMotion, state.phase]);

  React.useEffect(() => {
    if (!state.sessionOpen) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state.sessionOpen]);

  React.useEffect(() => {
    let frame: number | null = null;
    const openFromHash = () => {
      if (window.location.hash !== '#marketplace-search') return;
      if (collapsible) dispatch({ type: 'open' });
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        inputRef.current?.focus({ preventScroll: true });
      });
    };

    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => {
      window.removeEventListener('hashchange', openFromHash);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [collapsible]);

  React.useEffect(() => {
    const root = rootRef.current;
    const header = root?.closest('header');
    const shell = root?.closest('[data-marketplace-shell]');
    if (!(header instanceof HTMLElement) || !(shell instanceof HTMLElement)) return;

    const syncHeight = () => {
      shell.style.setProperty(
        '--marketplace-sticky-height',
        `${Math.ceil(header.getBoundingClientRect().height)}px`,
      );
    };
    syncHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncHeight);
      return () => {
        window.removeEventListener('resize', syncHeight);
        shell.style.removeProperty('--marketplace-sticky-height');
      };
    }

    const observer = new ResizeObserver(syncHeight);
    observer.observe(header);
    return () => {
      observer.disconnect();
      shell.style.removeProperty('--marketplace-sticky-height');
    };
  }, []);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(marketplaceHref(setMarketplaceSearch(new URLSearchParams(rawQuery), value)));
    inputRef.current?.blur();
  }

  function blurForm(event: React.FocusEvent<HTMLFormElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    dispatch({ type: 'blur' });
    if (state.sessionOpen) dispatch({ type: 'close' });
  }

  return (
    <div
      ref={rootRef}
      id="marketplace-search"
      data-phase={phase}
      data-session-open={state.sessionOpen ? 'true' : 'false'}
      className={cn('marketplace-search', collapsible && 'marketplace-search--collapsible')}
    >
      <button
        type="button"
        aria-label="Qidiruvni ochish"
        aria-expanded={state.sessionOpen}
        onClick={() => dispatch({ type: 'open' })}
        className={cn(
          'tap-press min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-card',
          phase === 'compact' ? 'inline-flex' : 'hidden',
        )}
      >
        <Search className="h-4 w-4" />
      </button>

      <form
        role="search"
        onSubmit={submit}
        onFocusCapture={() => dispatch({ type: 'focus' })}
        onBlurCapture={blurForm}
        aria-busy={marketplaceNavigation?.pending || undefined}
        className={cn('marketplace-search-form', phase === 'compact' && 'hidden')}
      >
        <div
          className="marketplace-search-inner relative"
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === 'opacity') {
              dispatch({ type: 'transitionEnd' });
            }
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            name="q"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label="Marketplace qidiruvi"
            placeholder="Akkount, Messi, Division..."
            className={cn('h-11 pl-9', state.sessionOpen ? 'pr-11' : 'pr-3')}
          />
          {state.sessionOpen && (
            <button
              type="button"
              aria-label="Qidiruvni yopish"
              onClick={() => dispatch({ type: 'close' })}
              className="absolute right-0 top-0 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
