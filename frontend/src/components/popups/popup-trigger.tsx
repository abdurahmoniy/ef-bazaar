'use client';
import { useEffect, useRef } from 'react';
import { clearPopupTrigger, queuePopupTrigger } from '@/lib/popups/triggers';
import { usePopupLocation } from './use-popup-location';
import type { PopupTrigger } from '@/lib/popups/types';

export function PopupTriggerSignal({ trigger, eventKey, userId }: { trigger: Exclude<PopupTrigger, 'BROWSE' | 'TRADE_COMPLETED'>; eventKey: string; userId?: string }) {
  const location = usePopupLocation();
  useEffect(() => {
    const id = userId || document.querySelector('[data-popup-user-id]')?.getAttribute('data-popup-user-id');
    if (!id) return;
    queuePopupTrigger(trigger, id, eventKey, location);
    return () => clearPopupTrigger(id, eventKey);
  }, [trigger, eventKey, userId, location]);
  return null;
}
export function TradeCompletedPopupTrigger({ userId, trades }: { userId: string; trades: { id: string; state: string }[] | null }) {
  const previous = useRef<{ userId: string; states: Map<string, string> } | null>(null);
  useEffect(() => {
    if (!trades) return;
    const before = previous.current?.userId === userId ? previous.current.states : null;
    for (const trade of trades) {
      if (trade.state === 'SUCCESS' && before?.has(trade.id) && before.get(trade.id) !== 'SUCCESS') queuePopupTrigger('TRADE_COMPLETED', userId, trade.id);
    }
    previous.current = { userId, states: new Map(trades.map(trade => [trade.id, trade.state])) };
  }, [trades, userId]);
  return null;
}
