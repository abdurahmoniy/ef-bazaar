'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface MessageHotkeysProps {
  backHref: string;
  /** Newer message, when known. */
  prevHref: string | null;
  /** Older message, when known. */
  nextHref: string | null;
}

/**
 * Keyboard navigation for the reader: Escape → inbox, ←/k → newer message,
 * →/j → older message (Gmail muscle memory). Renders nothing.
 */
export function MessageHotkeys({ backHref, prevHref, nextHref }: MessageHotkeysProps) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Escape') router.push(backHref);
      else if ((e.key === 'ArrowLeft' || e.key === 'k') && prevHref) router.push(prevHref);
      else if ((e.key === 'ArrowRight' || e.key === 'j') && nextHref) router.push(nextHref);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router, backHref, prevHref, nextHref]);

  return null;
}
