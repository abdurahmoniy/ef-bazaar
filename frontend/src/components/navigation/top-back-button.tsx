'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import * as React from 'react';

import { useTelegramBackButton } from '@/hooks/use-telegram-back-button';
import { readDetailBackMarker, sameMarketplaceHref } from '@/lib/marketplace-scroll-state';
import { cn } from '@/lib/utils';

interface TopBackButtonProps {
  href: string;
  label?: string;
  className?: string;
}

/**
 * Chevron-style back button placed inside the marketplace shell header.
 *
 * Behaves adaptively:
 *  - In a Telegram Mini App: activates the native {@code BackButton} in
 *    Telegram's own chrome and renders nothing itself (the top-bar arrow
 *    would be redundant).
 *  - In a normal browser: renders a tappable chevron with an accessible
 *    label — the primary way for the user to leave a drill-down page.
 */
export function TopBackButton({ href, label = 'Orqaga', className }: TopBackButtonProps) {
  const goBack = useMarketplaceBackNavigation(href);
  const isTelegram = useTelegramBackButton(goBack);

  if (isTelegram) return null;

  return (
    <Link
      href={href}
      aria-label={label}
      onClick={(event) => {
        if (
          event.defaultPrevented
          || event.button !== 0
          || event.metaKey
          || event.ctrlKey
          || event.shiftKey
          || event.altKey
        ) return;
        event.preventDefault();
        goBack();
      }}
      className={cn(
        'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-foreground/70 transition',
        'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
    >
      <ChevronLeft className="h-5 w-5" />
    </Link>
  );
}

export function useMarketplaceBackNavigation(href: string) {
  const router = useRouter();
  return React.useCallback(() => {
    const marker = readDetailBackMarker(window.history.state);
    if (marker && sameMarketplaceHref(marker.previousFeedHref, href)) {
      window.history.back();
      return;
    }
    router.replace(href);
  }, [href, router]);
}
