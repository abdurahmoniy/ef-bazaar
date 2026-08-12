'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { useTelegramBackButton } from '@/hooks/use-telegram-back-button';
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
  const router = useRouter();
  const isTelegram = useTelegramBackButton(() => router.replace(href));

  if (isTelegram) return null;

  return (
    <Link
      href={href}
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
