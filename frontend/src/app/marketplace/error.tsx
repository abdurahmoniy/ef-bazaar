'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function MarketplaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[marketplace] Unexpected route error', error);
  }, [error]);

  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center shadow-card sm:py-16">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <AlertTriangle className="h-10 w-10" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-base font-black text-foreground">
        E‘lonlarni yuklay olmadik
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Aloqani tekshirib, qayta urinib ko‘ring.
      </p>
      <Button type="button" onClick={reset} className="mt-5 min-h-11">
        Qayta urinish
      </Button>
    </div>
  );
}
