'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function WalletError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Message only. An invoice payload carries the full card number, so
    // nothing from a payment response may be widened into a log line here.
    console.error('[hamyon] Unexpected route error', error.message);
  }, [error]);

  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center shadow-card sm:py-16">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <AlertTriangle className="h-10 w-10" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-base font-black text-foreground">
        Hamyonni ochib bo‘lmadi
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Balansingiz va to‘lovlaringiz joyida. Aloqani tekshirib, qayta urinib ko‘ring.
      </p>
      <Button type="button" onClick={reset} className="mt-5 min-h-11">
        Qayta urinish
      </Button>
    </div>
  );
}
