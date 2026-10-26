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
          className="w-full border-success-border text-success hover:bg-success-soft"
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
    <div className="rounded-lg border border-success-border bg-success-soft p-3">
      <p className="text-sm font-semibold text-success">
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
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={handleMarkSold}
          disabled={pending}
        >
          {pending ? 'Belgilanmoqda…' : 'Ha, sotildi'}
        </Button>
      </div>
    </div>
  );
}
