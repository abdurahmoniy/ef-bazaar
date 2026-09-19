'use client';

import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Place inside a Next Link so slow navigations receive immediate feedback. */
export function LinkPendingIndicator({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span className={cn('pointer-events-none inline-grid place-items-center', className)} role="status">
      <Loader2 aria-hidden className={cn('h-5 w-5 animate-spin motion-reduce:animate-none', iconClassName)} />
      <span className="sr-only">Yuklanmoqda</span>
    </span>
  );
}
