'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';

const TAB_PATHS = ['/marketplace', '/tournaments', '/chats', '/marketplace/new', '/hamyon', '/profile'];

function tabIndex(pathname: string) {
  // The sell flow belongs to its own tab, despite sharing the marketplace prefix.
  if (pathname === '/marketplace/new') return TAB_PATHS.indexOf(pathname);
  return TAB_PATHS.findIndex((tab) => pathname === tab || pathname.startsWith(`${tab}/`));
}

function direction(from: string, to: string) {
  const previousTab = tabIndex(from);
  const nextTab = tabIndex(to);
  if (previousTab !== -1 && nextTab !== -1 && previousTab !== nextTab) {
    return Math.sign(nextTab - previousTab);
  }
  if (to.startsWith(`${from}/`)) return 1;
  if (from.startsWith(`${to}/`)) return -1;
  return 0;
}

/** Animate only the arriving content; links, history and scroll remain owned by Next. */
export function RouteMotion() {
  const pathname = usePathname();
  const previousPath = useRef(pathname);

  useLayoutEffect(() => {
    const from = previousPath.current;
    previousPath.current = pathname;
    if (!from || !pathname || from === pathname) return;

    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) return;

    const offset = direction(from, pathname) * 18;
    const animations: Animation[] = [];
    const animateContent = () => {
      if (preference.matches) return false;
      for (const element of document.querySelectorAll<HTMLElement>('[data-page-transition]')) {
        if (!element.animate || element.getClientRects().length === 0) continue;
        // App Router can commit the pathname before a loading boundary resolves.
        if (element.querySelector('[data-page-transition-loading], [data-marketplace-route-loading]')) continue;

        // A transform would change the containing block of fixed action bars.
        const hasFixedChild = Array.from(element.querySelectorAll('*'))
          .some((child) => getComputedStyle(child).position === 'fixed');
        animations.push(element.animate(
          hasFixedChild ? [{ opacity: 0.35 }, { opacity: 1 }] : [
            { opacity: 0.35, transform: `translate3d(${offset}px, 0, 0)` },
            { opacity: 1, transform: 'translate3d(0, 0, 0)' },
          ],
          { duration: 240, easing: 'cubic-bezier(.22,1,.36,1)' },
        ));
      }
      return animations.length > 0;
    };

    let observer: MutationObserver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const stopWaiting = () => {
      observer?.disconnect();
      clearTimeout(timeout);
    };
    if (!animateContent()) {
      observer = new MutationObserver(() => { if (animateContent()) stopWaiting(); });
      observer.observe(document.body, { childList: true, subtree: true });
      // Do not watch an unmarked route indefinitely (e.g. an auth redirect).
      timeout = setTimeout(stopWaiting, 10_000);
    }

    const cancel = () => animations.forEach((animation) => animation.cancel());
    const onPreferenceChange = () => {
      if (preference.matches) { stopWaiting(); cancel(); }
    };
    preference.addEventListener('change', onPreferenceChange);
    return () => {
      cancel();
      stopWaiting();
      preference.removeEventListener('change', onPreferenceChange);
    };
  }, [pathname]);

  return null;
}
