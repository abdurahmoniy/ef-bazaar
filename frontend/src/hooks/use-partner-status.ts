'use client';

import { useEffect, useState } from 'react';
import { isPartner } from '@/lib/admin';
import { canOpenPartnerPanel } from '@/lib/partner-panel';
import { getMyApplication, type PartnerApplication } from '@/lib/partners';
import type { User } from '@/lib/types';

/** Approved applications also cover admins and users whose role has not synced yet. */
export function usePartnerDetails(user: User, enabled = true) {
  const [result, setResult] = useState<{ userId: string; application: PartnerApplication | null } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const refresh = async () => {
      try {
        const application = await getMyApplication();
        if (active) setResult({ userId: user.id, application });
      } catch {
        // Keep the last known status (or role fallback) during a temporary outage.
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [user.id, enabled]);

  const current = result?.userId === user.id ? result : null;
  return {
    partner: current ? canOpenPartnerPanel(current.application) : isPartner(user),
    application: current?.application ?? null,
  };
}

export function usePartnerStatus(user: User, enabled = true): boolean {
  return usePartnerDetails(user, enabled).partner;
}
