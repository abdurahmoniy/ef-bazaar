'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export function useChatMessageNavigation(listRef: RefObject<HTMLDivElement | null>, stopFollowing?: () => void) {
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  const jumpToMessage = useCallback((messageId: string) => {
    const message = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [])
      .find((element) => element.dataset.messageId === messageId);
    if (!message) return false;

    stopFollowing?.();
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    message.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
      timerRef.current = null;
    }, 1500);
    return true;
  }, [listRef, stopFollowing]);

  return { jumpToMessage, highlightedMessageId };
}
