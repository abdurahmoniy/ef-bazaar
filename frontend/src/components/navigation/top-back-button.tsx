'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { useTelegramBackButton } from '@/hooks/use-telegram-back-button';
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
  const router = useRouter();
  const isTelegram = useTelegramBackButton(() => router.push(href));

  if (isTelegram) return null;

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground/70 transition',
        'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
    >
      <ChevronLeft className="h-5 w-5" />
    </Link>
  );
}
