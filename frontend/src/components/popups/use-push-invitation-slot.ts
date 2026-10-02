'use client';
import { useEffect, useState } from 'react';
import { usePopupLocation } from './use-popup-location';
import { acquireAttention, canInterrupt, isPopupRoute, isQuietForPopup, markInterrupted } from '@/lib/popups/policy';

export function usePushInvitationSlot(userId: string | null, eligible: boolean): boolean {
  const pathname = usePopupLocation();
  const [slot, setSlot] = useState<{ userId: string; pathname: string } | null>(null);
  useEffect(() => {
    if (!userId || !eligible || !isPopupRoute(pathname)) return;
    const started = Date.now(); let activity = started; let release: (() => void) | null = null;
    const onActivity = () => { activity = Date.now(); };
    for (const event of ['pointerdown', 'keydown', 'scroll']) window.addEventListener(event, onActivity, true);
    const interval = window.setInterval(() => {
      // The marketplace shell supplies the account UUID even in Telegram, where
      // permission transport identifies the user by their Telegram id.
      const accountId = document.querySelector('[data-popup-user-id]')?.getAttribute('data-popup-user-id') || userId;
      if (!isQuietForPopup(document, 'push')) {
        if (release) { release(); release = null; setSlot(null); }
        return;
      }
      if (release || Date.now() - started < 45_000 || Date.now() - activity < 3_000 || !canInterrupt(accountId)) return;
      release = acquireAttention();
      if (release) { markInterrupted(accountId); setSlot({ userId, pathname }); }
    }, 1000);
    return () => {
      window.clearInterval(interval); release?.(); setSlot(null);
      for (const event of ['pointerdown', 'keydown', 'scroll']) window.removeEventListener(event, onActivity, true);
    };
  }, [userId, eligible, pathname]);
  return eligible && slot?.userId === userId && slot?.pathname === pathname && isPopupRoute(pathname);
}
