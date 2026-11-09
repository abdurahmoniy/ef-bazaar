'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { CAMPAIGN_CLICK_COOKIE, CAMPAIGN_COOKIE, readCampaignCookie } from '@/lib/campaign-capture';
import { claimCampaign, recordCampaignClick } from '@/lib/campaigns';

// Remounts (StrictMode, shell re-render) must not double-count a click or claim.
const inFlight = new Map<string, Promise<unknown>>();

function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  let request = inFlight.get(key) as Promise<T> | undefined;
  if (!request) {
    request = run().finally(() => inFlight.delete(key));
    inFlight.set(key, request);
  }
  return request;
}

function expire(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

/**
 * Kampaniya havolasi (`?c=`) uchun ikki ish:
 * 1. Middleware qo'ygan bosilish belgisini ko'rsa — bosilishni bir marta yuboradi.
 *    Bu kirmagan odam uchun ham ishlaydi, shuning uchun root layout'da ham turadi.
 * 2. `authenticated` bo'lsa — kodni da'vo qiladi (server faqat yangi akkountni
 *    biriktiradi). `authenticated` berilmagan joyda da'vo qilinmaydi: u yerda
 *    sessiya holati noma'lum va har sahifada 401 olib yurish ma'nosiz.
 */
export function CampaignCapture({ authenticated }: { authenticated?: boolean }) {
  return (
    <Suspense fallback={null}>
      <CaptureLifecycle authenticated={authenticated === true} />
    </Suspense>
  );
}

function CaptureLifecycle({ authenticated }: { authenticated: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams()?.toString();

  useEffect(() => {
    let disposed = false;

    async function run() {
      const clicked = readCampaignCookie(document.cookie, CAMPAIGN_CLICK_COOKIE);
      if (clicked) {
        try {
          await once(`click:${clicked}`, () => recordCampaignClick(clicked));
          // A newer link may have replaced the marker meanwhile — keep that one.
          if (readCampaignCookie(document.cookie, CAMPAIGN_CLICK_COOKIE) === clicked) {
            expire(CAMPAIGN_CLICK_COOKIE);
          }
        } catch {
          // Tracking must never break navigation; the marker stays for the next page.
        }
      }

      if (disposed || !authenticated) return;
      const code = readCampaignCookie(document.cookie, CAMPAIGN_COOKIE);
      if (!code) return;
      try {
        await once(`claim:${code}`, () => claimCampaign(code));
        // Any definitive answer (claimed or not) ends the attempt; HTTP errors throw.
        if (readCampaignCookie(document.cookie, CAMPAIGN_COOKIE) === code) {
          expire(CAMPAIGN_COOKIE);
        }
      } catch {
        // Keep the cookie: the next navigation retries.
      }
    }

    void run();
    return () => {
      disposed = true;
    };
  }, [authenticated, pathname, search]);

  return null;
}
