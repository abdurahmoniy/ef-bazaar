'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { deleteListing } from '@/lib/marketplace-actions';

/**
 * Edit / delete bar shown under the seller's own cards on the profile
 * "listings" tab. Delete is the same two-click confirm flow as on the edit
 * page; on success the profile page is refreshed so the row disappears.
 */
export function ListingOwnerActions({ listingId }: { listingId: string }) {
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
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="rounded-lg border border-destructive/60 bg-destructive/5 p-2">
        <p className="text-xs font-semibold text-destructive">
          E&apos;lonni o&apos;chirishga ishonchingiz komilmi?
        </p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
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
            size="sm"
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

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href={`/marketplace/${listingId}/edit`}>
          <Pencil className="h-3.5 w-3.5" /> Tahrirlash
        </Link>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-destructive text-destructive hover:bg-destructive/10"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" /> O&apos;chirish
      </Button>
    </div>
  );
}
