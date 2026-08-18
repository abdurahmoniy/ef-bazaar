'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { markListingSold } from '@/lib/marketplace-actions';

interface MarkSoldButtonProps {
  listingId: string;
  className?: string;
  onSuccess?: () => void;
}

export function MarkSoldButton({ listingId, className, onSuccess }: MarkSoldButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleMarkSold() {
    startTransition(async () => {
      setError(null);
      const result = await markListingSold(listingId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setConfirming(false);
      if (onSuccess) {
        onSuccess();
      }
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <div className={className}>
        <Button
          type="button"
          variant="outline"
          className="w-full border-emerald-500/60 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          <CheckCircle2 className="mr-1.5 h-4 w-4" />
          Sotildi deb belgilash
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
        E&apos;lonni sotilgan deb belgilaysizmi?
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        E&apos;lon sotilganlar qatoriga o&apos;tkaziladi va xaridorlarga sotilgan holatda ko&apos;rinadi.
      </p>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
        >
          Bekor qilish
        </Button>
        <Button
          type="button"
          size="sm"
          className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
          onClick={handleMarkSold}
          disabled={pending}
        >
          {pending ? 'Belgilanmoqda…' : 'Ha, sotildi'}
        </Button>
      </div>
    </div>
  );
}
