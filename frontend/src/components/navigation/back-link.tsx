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
 * Visible back navigation in browsers and Telegram Mini Apps. Registers the
 * native handler too, without relying on Telegram to display its back arrow.
 */
export function BackLink({ href, label = 'Orqaga', className }: BackLinkProps) {
  const goBack = useMarketplaceBackNavigation(href);
  useTelegramBackButton(goBack);

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
