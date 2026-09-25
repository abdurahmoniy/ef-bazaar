'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Follow new messages only while the reader is already at the bottom. */
export function useChatScroll(lastMessageId: string | undefined) {
  const listRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const sizeRef = useRef({ width: 0, height: 0 });
  const previousMessageRef = useRef(lastMessageId);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const scrollToBottom = useCallback(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    followingRef.current = true;
    setHasNewMessages(false);
  }, []);

  useLayoutEffect(() => {
    if (followingRef.current) scrollToBottom();
    else if (lastMessageId && lastMessageId !== previousMessageRef.current) setHasNewMessages(true);
    previousMessageRef.current = lastMessageId;
  }, [lastMessageId, scrollToBottom]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    sizeRef.current = { width: list.clientWidth, height: list.clientHeight };
    const observer = new ResizeObserver(() => {
      sizeRef.current = { width: list.clientWidth, height: list.clientHeight };
      if (followingRef.current) scrollToBottom();
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  const onScroll = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    // Keyboard/orientation reflow can emit scroll before the resize observer.
    // Keep the reader's previous intent until that observer restores the bottom.
    if (typeof ResizeObserver !== 'undefined' && (
      list.clientWidth !== sizeRef.current.width || list.clientHeight !== sizeRef.current.height
    )) return;
    followingRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    if (followingRef.current) setHasNewMessages(false);
  }, []);

  const stopFollowing = useCallback(() => { followingRef.current = false; }, []);

  return {
    stopFollowing, listRef, onScroll, scrollToBottom, hasNewMessages,
    followNextMessage: scrollToBottom,
  };
}
