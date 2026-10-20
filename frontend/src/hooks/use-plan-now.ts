'use client';

import { useEffect, useState } from 'react';
import type { MyPlan } from '@/lib/plans';

/** Re-render at membership boundaries, including deadlines beyond setTimeout's range. */
export function usePlanNow(plan: MyPlan | null): Date {
  const [, setNow] = useState(() => Date.now());
  const expiry = plan?.expiresAt;
  const grace = plan?.graceEndsAt;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function schedule() {
      const current = Date.now();
      const next = [expiry, grace].map(value => value ? Date.parse(value) : NaN)
        .filter(value => Number.isFinite(value) && value > current).sort((a, b) => a - b)[0];
      if (next !== undefined) timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, Math.min(next - current, 2_147_483_647));
    }
    setNow(Date.now());
    schedule();
    const refresh = () => setNow(Date.now());
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [expiry, grace]);
  return new Date();
}
