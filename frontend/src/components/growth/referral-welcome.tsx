'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { ReferralCapture } from '@/components/referral/referral-capture';
import { readCookieCode } from '@/lib/referral-capture';

/** Static landing pages only probe a session when an invitation needs claiming. */
export function ReferralWelcome() {
  return <Suspense fallback={null}><ReferralWelcomeContent /></Suspense>;
}

function ReferralWelcomeContent() {
  const search = useSearchParams().toString();
  const [invited, setInvited] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    if (!readCookieCode(document.cookie)) return;
    setInvited(true);
    let active = true;
    let inFlight = false;
    let delay = 1000;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const checkSession = () => {
      if (!active || inFlight) return;
      clearTimeout(retry);
      inFlight = true;
      fetch('/api/session', { credentials: 'include', cache: 'no-store' })
        .then((response) => { if (!response.ok) throw new Error('Session unavailable'); return response.json(); })
        .then((session) => { if (active) setAuthenticated(session?.authenticated === true); })
        .catch(() => {
          if (active) {
            retry = setTimeout(checkSession, delay);
            delay = Math.min(delay * 2, 30000);
          }
        })
        .finally(() => { inFlight = false; });
    };
    checkSession();
    window.addEventListener('focus', checkSession);
    window.addEventListener('online', checkSession);
    return () => {
      active = false;
      clearTimeout(retry);
      window.removeEventListener('focus', checkSession);
      window.removeEventListener('online', checkSession);
    };
  }, [search]);
  if (!invited) return null;
  return <>
    <ReferralCapture authenticated={authenticated} />
    <div className="container pt-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <UserPlus aria-hidden className="h-5 w-5 shrink-0 text-primary dark:text-secondary" />
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">Taklif orqali keldingiz — xush kelibsiz! Sizga mos eFootball akkountlarini ko‘rib chiqing.</p>
        <Link href="/marketplace" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-primary dark:text-secondary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Bozorni ko‘rish →</Link>
      </div>
    </div>
  </>;
}
