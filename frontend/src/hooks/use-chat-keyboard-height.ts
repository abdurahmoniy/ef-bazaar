'use client';

import { useLayoutEffect, useState } from 'react';
import { getTelegramWebApp } from '@/lib/telegram';

/** Match the emoji dock to the last observed keyboard, without focus heuristics. */
export function useChatKeyboardHeight() {
  const [height, setHeight] = useState(280);
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let width = window.innerWidth;
    let fullHeight = Math.max(window.innerHeight, viewport.height);
    const update = () => {
      if (Math.abs(viewport.scale - 1) > 0.01) return;
      if (Math.abs(window.innerWidth - width) > 80) {
        width = window.innerWidth;
        fullHeight = Math.max(window.innerHeight, viewport.height);
        setHeight(280);
      }
      if (window.innerWidth >= 768) return;
      const app = getTelegramWebApp();
      const stableHeight = app?.initData?.trim() ? app.viewportStableHeight : 0;
      fullHeight = Math.max(fullHeight, window.innerHeight, stableHeight ?? 0, viewport.height);
      const keyboardHeight = fullHeight - viewport.height - Math.max(0, viewport.offsetTop);
      // Small browser chrome changes are not a keyboard. Retain the last size
      // when blur restores the viewport so the picker replaces that keyboard.
      if (keyboardHeight > 120) setHeight(Math.min(360, Math.max(180, keyboardHeight)));
    };
    update(); viewport.addEventListener('resize', update); window.addEventListener('resize', update);
    return () => { viewport.removeEventListener('resize', update); window.removeEventListener('resize', update); };
  }, []);
  return height;
}
