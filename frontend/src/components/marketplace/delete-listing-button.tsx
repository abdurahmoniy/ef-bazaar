'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { deleteListing } from '@/lib/marketplace-actions';

/**
 * "O'chirish" action for the seller on their own listing's edit page.
 * Two-click confirm: first click opens an inline confirm strip, second click
 * fires DELETE /api/v1/listings/{id}. On success the seller lands back on
 * their profile listings tab (SSR reload picks up the missing row).
 */
export function DeleteListingButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fire() {
    startTransition(async () => {
      const result = await deleteListing(listingId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Land the seller on their accounts tab so they see the row is gone.
      router.push('/profile?tab=accounts');
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <div className="mt-8 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          className="w-full border-destructive text-destructive hover:bg-destructive/10"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          E&apos;lonni o&apos;chirish
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          O&apos;chirilgan e&apos;lon qidiruvda ko&apos;rinmaydi. Tiklanish faqat
          admin orqali.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-lg border border-destructive/60 bg-destructive/5 p-3">
      <p className="text-sm font-semibold text-destructive">
        E&apos;lonni o&apos;chirishga ishonchingiz komilmi?
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Bu amalni o&apos;zingiz qaytara olmaysiz.
      </p>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="ghost"
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
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          onClick={fire}
          disabled={pending}
        >
          {pending ? "O'chirilmoqda…" : "Ha, o'chirish"}
        </Button>
      </div>
    </div>
  );
}
