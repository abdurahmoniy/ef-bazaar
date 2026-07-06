'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface AuthAwareLinkProps {
  /** Rendered on the server and for signed-out visitors. */
  anonHref: string;
  anonLabel: string;
  /** Swapped in after hydration when the session cookie is present. */
  authHref: string;
  authLabel: string;
  className?: string;
}

/**
 * Nav link that shows "Kirish" until the client confirms a session, then
 * swaps to the authenticated variant ("Profil"). Lets static pages (landing)
 * stay static — the check is one cheap same-origin /api/session fetch.
 */
export function AuthAwareLink({
  anonHref,
  anonLabel,
  authHref,
  authLabel,
  className,
}: AuthAwareLinkProps) {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/session', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { authenticated?: boolean } | null) => {
        if (!cancelled && payload?.authenticated) setAuthenticated(true);
      })
      .catch(() => {
        // stay anonymous — link still works
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link href={authenticated ? authHref : anonHref} className={className}>
      {authenticated ? authLabel : anonLabel}
    </Link>
  );
}
