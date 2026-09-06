'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { trackGrowth } from '@/lib/growth-analytics';
import { readCookieCode, REFERRAL_COOKIE } from '@/lib/referral-capture';
import { claimReferral } from '@/lib/referrals';

// A shell can remount before its request finishes (including React StrictMode).
// Reuse that request, while each mounted consumer owns its own retry lifecycle.
const inFlight = new Map<string, Promise<boolean>>();

function claimOnce(code: string) {
  let request = inFlight.get(code);
  if (!request) {
    request = claimReferral(code).finally(() => inFlight.delete(code));
    inFlight.set(code, request);
  }
  return request;
}

/** Claims the middleware's last-click cookie once authentication is available. */
export function ReferralCapture({ authenticated }: { authenticated: boolean }) {
  return (
    <Suspense fallback={null}>
      <CaptureLifecycle authenticated={authenticated} />
    </Suspense>
  );
}

function CaptureLifecycle({ authenticated }: { authenticated: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams()?.toString();

  useEffect(() => {
    if (!authenticated) return;

    let disposed = false;
    let running = false;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function attempt() {
      if (disposed || running) return;
      clearTimeout(retryTimer);
      const code = readCookieCode(document.cookie);
      if (!code || !navigator.onLine) return;

      running = true;
      let failed = false;
      try {
        const claimed = await claimOnce(code);
        if (disposed) return;
        // A newer link may have replaced this cookie while the request ran.
        // The old response must never erase the new last-click attribution.
        if (readCookieCode(document.cookie) === code) {
          document.cookie = `${REFERRAL_COOKIE}=; path=/; max-age=0`;
          if (claimed) trackGrowth('referral_claimed', { placement: 'capture' });
        }
      } catch {
        failed = true;
      } finally {
        running = false;
        if (!disposed) {
          const latest = readCookieCode(document.cookie);
          if (latest && latest !== code) {
            retryDelay = 1000;
            void attempt();
          } else if (latest && failed) {
            retryTimer = setTimeout(() => { void attempt(); }, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30_000);
          }
        }
      }
    }

    const wake = () => { void attempt(); };
    const onVisible = () => {
      if (document.visibilityState === 'visible') wake();
    };
    wake();
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authenticated, pathname, search]);

  return null;
}
