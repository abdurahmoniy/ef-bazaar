'use client';

import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { useRef, useState } from 'react';
import { CheckCircle2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareListingButton } from './share-listing-button';

export function ListingOwnerActions({ listingId, title, priceLabel, variant, pending, error, onMarkSold }: {
  listingId: string;
  title: string;
  priceLabel?: string;
  variant: 'bar' | 'panel';
  pending: boolean;
  error?: string;
  onMarkSold: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  return (
    <div className="space-y-2">
      {variant === 'bar' && priceLabel && <p className="text-sm font-bold text-[hsl(var(--price))]">{priceLabel}<span className="ml-2 text-xs font-normal text-muted-foreground">Bozorda</span></p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild className="min-h-11 flex-1 rounded-xl px-3"><Link href={`/marketplace/${listingId}/edit`}>Tahrirlash</Link></Button>
        <ShareListingButton listingId={listingId} title={title} authenticated label="Ulashish" className="px-3" placement={variant === 'bar' ? 'above' : 'below'} />
        <details ref={menu} className="relative" onKeyDown={(event) => {
          if (event.key === 'Escape') { menu.current?.removeAttribute('open'); trigger.current?.focus(); }
        }} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) menu.current?.removeAttribute('open');
        }}>
          <summary ref={trigger} aria-label="E’lonni boshqarish" className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-xl border border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <MoreHorizontal aria-hidden className="h-5 w-5" />
          </summary>
          <div className={`absolute right-0 z-40 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-1 shadow-lg ${variant === 'bar' ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
            <button type="button" disabled={pending} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { menu.current?.removeAttribute('open'); setConfirming(true); }}>
              <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />Sotilgan deb belgilash
            </button>
          </div>
        </details>
      </div>
      <Dialog.Root open={confirming} onOpenChange={(open) => { if (!pending) setConfirming(open); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/50" />
          <Dialog.Content onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }} className="fixed left-1/2 top-1/2 z-[81] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
            <Dialog.Title className="text-lg font-bold">E’lonni sotilgan deb belgilaysizmi?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">E’lon xaridorlarga sotilgan ko‘rinadi va yangi murojaatlar yopiladi. Kerak bo‘lsa, keyin qayta sotuvga qo‘yishingiz mumkin.</Dialog.Description>
            {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
            <div className="mt-5 flex flex-col gap-2">
              <Dialog.Close asChild><Button variant="outline" className="min-h-11" disabled={pending}>Bekor qilish</Button></Dialog.Close>
              <Button className="min-h-11 whitespace-normal" disabled={pending} onClick={onMarkSold}>{pending ? 'Belgilanmoqda…' : 'Ha, sotilgan deb belgilash'}</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
