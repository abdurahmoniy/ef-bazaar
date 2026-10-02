'use client';
import { useCallback, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { normalizePopupLocation } from '@/lib/popups/policy';
// Also observes query-only Next navigation without making the root provider
// depend on useSearchParams/Suspense. Async delivery additionally checks the URL.
function subscribe(listener: () => void) {
  const timer = window.setInterval(listener, 1000);
  window.addEventListener('popstate', listener);
  return () => { window.clearInterval(timer); window.removeEventListener('popstate', listener); };
}
export function usePopupLocation(): string {
  const pathname = usePathname() ?? '';
  const snapshot = useCallback(() => normalizePopupLocation((pathname || window.location.pathname) + window.location.search), [pathname]);
  const serverSnapshot = useCallback(() => pathname, [pathname]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
