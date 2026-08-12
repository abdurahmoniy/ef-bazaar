'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { useTelegramBackButton } from '@/hooks/use-telegram-back-button';
import { useMarketplaceBackNavigation } from '@/components/navigation/top-back-button';
import { cn } from '@/lib/utils';

interface BackLinkProps {
  href: string;
  label?: string;
  className?: string;
}

/**
 * Back navigation that adapts to context: inside a Telegram Mini App it
 * activates the native BackButton and renders nothing itself (Telegram's own
 * chrome already shows the arrow); in a plain browser — which otherwise has
 * no way back on these drill-down pages — it renders a normal link.
 */
export function BackLink({ href, label = 'Orqaga', className }: BackLinkProps) {
  const goBack = useMarketplaceBackNavigation(href);
  const isTelegram = useTelegramBackButton(goBack);

  if (isTelegram) return null;

  return (
    <Link
      href={href}
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
        'inline-flex min-h-11 min-w-11 items-center gap-1 px-1 text-sm font-bold text-muted-foreground transition hover:text-foreground',
        className,
      )}
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
