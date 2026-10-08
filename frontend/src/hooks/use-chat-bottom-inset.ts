'use client';

import { useLayoutEffect, useState } from 'react';
import { getTelegramWebApp } from '@/lib/telegram';
import type { TelegramWebAppEvent } from '@/lib/types';

function validInset(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Reserve only the unsafe area still overlapping the visible chat viewport. */
export function useChatBottomInset(viewport: { height: number; offsetTop: number } | null): number | null {
  const [bottom, setBottom] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!viewport) { setBottom(null); return; }
    const root = document.documentElement;
    const probe = document.createElement('div');
    probe.setAttribute('data-chat-safe-area-probe', '');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.append(probe);
    const webApp = getTelegramWebApp();
    const isMiniApp = Boolean(webApp?.initData?.trim());

    const update = () => {
      // The viewport hook freezes its geometry while the page is pinch-zoomed.
      if (window.visualViewport && Math.abs(window.visualViewport.scale - 1) > 0.01) return;
      const currentApp = getTelegramWebApp();
      const insideMiniApp = Boolean(currentApp?.initData?.trim());
      const browserBottom = Number.parseFloat(window.getComputedStyle(probe).paddingBottom) || 0;
      const hostBottom = insideMiniApp ? currentApp?.safeAreaInset?.bottom : undefined;
      const contentBottom = insideMiniApp ? currentApp?.contentSafeAreaInset?.bottom : undefined;
      // A host-provided zero means the native container already provides clearance.
      const inset = Math.max(validInset(hostBottom) ? hostBottom : browserBottom, validInset(contentBottom) ? contentBottom : 0);
      const telegramHeight = Number.parseFloat(root.style.getPropertyValue('--tg-viewport-height')) || 0;
      const visibleBottom = viewport.offsetTop + Math.min(viewport.height, telegramHeight || viewport.height);
      const excludedBottom = Math.max(0, Math.max(window.innerHeight, telegramHeight) - visibleBottom);
      setBottom(Math.max(0, inset - excludedBottom));
    };

    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['style'] });
    const events: TelegramWebAppEvent[] = ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged'];
    if (isMiniApp) for (const event of events) webApp?.onEvent?.(event, update);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      probe.remove();
      window.removeEventListener('resize', update);
      if (isMiniApp) for (const event of events) webApp?.offEvent?.(event, update);
    };
  }, [viewport]);

  return bottom;
}
