'use client';

import { useEffect, useState } from 'react';
import { isPartner } from '@/lib/admin';
import { canOpenPartnerPanel } from '@/lib/partner-panel';
import { getMyApplication } from '@/lib/partners';
import type { User } from '@/lib/types';

/** Approved applications also cover admins and users whose role has not synced yet. */
export function usePartnerStatus(user: User, enabled = true): boolean {
  const [result, setResult] = useState<{ userId: string; approved: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const refresh = async () => {
      try {
        const application = await getMyApplication();
        if (active) setResult({ userId: user.id, approved: canOpenPartnerPanel(application) });
      } catch {
        // Keep the last known status (or role fallback) during a temporary outage.
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [user.id, enabled]);

  return result?.userId === user.id ? result.approved : isPartner(user);
}
