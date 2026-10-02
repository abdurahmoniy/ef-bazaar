'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { acquireAttention, canInterrupt, getPopupSessionId, isPopupRoute, isQuietForPopup, markInterrupted, normalizePopupLocation } from '@/lib/popups/policy';
import { claimPopup, nextPopup, recordPopupEvent } from '@/lib/popups/client';
import { clearPopupTrigger, pendingPopupTrigger, popupTriggerIdentity } from '@/lib/popups/triggers';
import type { PopupDelivery, PopupEvent } from '@/lib/popups/types';
import { PopupDialog } from './popup-dialog';
import { usePopupLocation } from './use-popup-location';
const polledAt = new Map<string, number>();

export function PopupHost({ userId }: { userId: string | null }) {
  const pathname = usePopupLocation(); const router = useRouter();
  const [delivery, setDelivery] = useState<(PopupDelivery & { userId: string; pathname: string }) | null>(null);
  const current = useRef<PopupDelivery | null>(null);
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!userId || !isPopupRoute(pathname)) return;
    const controller = new AbortController(); let busy = false; let stopped = false;
    const started = Date.now(); let activity = started;
    const onActivity = () => { activity = Date.now(); };
    for (const event of ['pointerdown', 'keydown', 'scroll']) window.addEventListener(event, onActivity, true);
    const safe = () => !stopped && normalizePopupLocation(pathname.split('?')[0] + window.location.search) === pathname && Date.now() - started >= 15_000 && Date.now() - activity >= 3_000 && isQuietForPopup(document);
    async function tick() {
      if (busy || current.current || !safe() || !canInterrupt(userId!)) return;
      const trigger = pendingPopupTrigger(userId!, pathname);
      const contextKey = popupTriggerIdentity(userId!, pathname);
      const key = `${userId}:${getPopupSessionId(userId!)}`;
      if (Date.now() - (polledAt.get(key) ?? 0) < 60_000) return;
      busy = true; polledAt.set(key, Date.now());
      if (polledAt.size > 200) polledAt.delete(polledAt.keys().next().value!);
      try {
        const candidate = await nextPopup(trigger, controller.signal);
        if (!candidate || !safe() || !canInterrupt(userId!) || popupTriggerIdentity(userId!, pathname) !== contextKey) return;
        const unlock = acquireAttention(); if (!unlock) return;
        release.current = unlock;
        const claimed = await claimPopup(candidate.id, trigger, getPopupSessionId(userId!), controller.signal);
        // A reservation may be consumed if the user navigated/started editing in flight;
        // never force a now-irrelevant popup just to count an impression.
        if (claimed) markInterrupted(userId!);
        if (!claimed || !safe() || popupTriggerIdentity(userId!, pathname) !== contextKey || !Number.isFinite(Date.parse(claimed.campaign.endsAt)) || Date.parse(claimed.campaign.endsAt) <= Date.now()) return;
        clearPopupTrigger(); current.current = claimed; setDelivery({ ...claimed, userId: userId!, pathname });
      } catch { /* Optional campaigns must never interrupt the primary task on failure. */ }
      finally { busy = false; if (!current.current) { release.current?.(); release.current = null; } }
    }
    const interval = window.setInterval(() => { void tick(); }, 1000);
    return () => {
      stopped = true; controller.abort(); window.clearInterval(interval);
      for (const event of ['pointerdown', 'keydown', 'scroll']) window.removeEventListener(event, onActivity, true);
      current.current = null; setDelivery(null); release.current?.(); release.current = null;
    };
  }, [userId, pathname]);
  // Runs after the dialog is actually committed, not after a successful claim.
  useEffect(() => { if (delivery) void recordPopupEvent(delivery.deliveryId, 'SHOWN').catch(() => {}); }, [delivery]);
  function finish(event: PopupEvent, path?: string) {
    const item = current.current; if (!item) return;
    current.current = null; setDelivery(null); release.current?.(); release.current = null;
    void recordPopupEvent(item.deliveryId, event).catch(() => {});
    if (path) router.push(path);
  }
  return delivery && delivery.userId === userId && delivery.pathname === pathname && isPopupRoute(pathname) ? <PopupDialog message={delivery.campaign} onDismiss={() => finish('DISMISSED')} onAction={path => finish('CLICKED', path)} /> : null;
}
