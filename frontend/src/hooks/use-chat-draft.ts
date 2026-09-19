'use client';

import { useCallback, useEffect, useState } from 'react';

/** Text drafts stay in this tab's session and are scoped to the viewer and chat. */
export function useChatDraft(viewerId: string, chatId: string): [string, (value: string) => void, (submitted: string) => void] {
  const key = `chat-draft:${encodeURIComponent(viewerId)}:${encodeURIComponent(chatId)}`;
  const [saved, setSaved] = useState({ key, value: '' });
  useEffect(() => {
    let value = '';
    try { value = sessionStorage.getItem(key) ?? ''; } catch { /* Storage may be disabled. */ }
    setSaved({ key, value });
  }, [key]);
  const setDraft = useCallback((value: string) => {
    setSaved({ key, value });
    try {
      if (value) sessionStorage.setItem(key, value);
      else sessionStorage.removeItem(key);
    } catch { /* An unavailable or full store must not prevent composing. */ }
  }, [key]);
  const clearSubmittedDraft = useCallback((submitted: string) => {
    try {
      // A send can finish after navigation. Only clear the snapshot it sent;
      // a newer composer may already have persisted a different draft.
      if ((sessionStorage.getItem(key) ?? '') === submitted) sessionStorage.removeItem(key);
    } catch { /* Local composing remains usable without browser storage. */ }
    setSaved(current => current.key === key && current.value === submitted
      ? { key, value: '' } : current);
  }, [key]);
  return [saved.key === key ? saved.value : '', setDraft, clearSubmittedDraft];
}
