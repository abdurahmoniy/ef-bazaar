'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface MarkReadBeaconProps {
  mailboxId: string;
  messageId: string;
  /** Skip the POST entirely when the message is already read. */
  seen: boolean;
}

/**
 * Fire-and-forget "mark as read" for the message reader. Runs client-side on
 * mount (never during SSR or link prefetch, so hovering a row can't mark it
 * read) and POSTs through the same-origin trade proxy. On success it soft-
 * refreshes the route so the sidebar unread badge drops immediately — the
 * current UI stays on screen while the refreshed payload streams in. The
 * endpoint is idempotent, so the dev-mode double-effect is harmless.
 * Failures are swallowed — worst case the message simply stays unread.
 */
export function MarkReadBeacon({ mailboxId, messageId, seen }: MarkReadBeaconProps) {
  const router = useRouter();

  useEffect(() => {
    if (seen) return;
    let cancelled = false;
    const url = `/api/trade/v1/mail/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}/read`;
    fetch(url, { method: 'POST' })
      .then((res) => {
        if (res.ok && !cancelled) router.refresh();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mailboxId, messageId, seen, router]);

  return null;
}
