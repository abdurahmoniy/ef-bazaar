'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const REVALIDATE_AFTER_MS = 30_000;

/** Recheck the visible page after returning to an older background tab. */
export function NavigationCacheGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const lastValidatedAt = useRef(Date.now());

  useEffect(() => {
    lastValidatedAt.current = Date.now();
  }, [pathname]);

  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastValidatedAt.current < REVALIDATE_AFTER_MS) return;
      lastValidatedAt.current = Date.now();
      router.refresh();
    };
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('focus', revalidate);
    window.addEventListener('pageshow', revalidate);
    return () => {
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('focus', revalidate);
      window.removeEventListener('pageshow', revalidate);
    };
  }, [router]);

  return null;
}
