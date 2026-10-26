'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Loader2, Send, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getMyReferrals } from '@/lib/referrals';
import { listingShareUrl, telegramListingShareUrl } from '@/lib/listing-share';
import { cn } from '@/lib/utils';
import { trackGrowth } from '@/lib/growth-analytics';

interface ShareListingButtonProps {
  listingId: string;
  title: string;
  authenticated?: boolean;
  label?: string;
  placement?: 'above' | 'below';
  className?: string;
}

export function ShareListingButton({ listingId, title, authenticated = false, label = 'Do‘stga yuborish', placement = 'below', className }: ShareListingButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const regionId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const plainUrl = listingShareUrl(window.location.origin, listingId);
    setUrl(plainUrl);
    setCopied(false);
    setCopyFailed(false);
    if (authenticated) {
      setLoading(true);
      // A failed lookup must not prevent ordinary listing sharing.
      const timeout = setTimeout(() => { if (active) { setLoading(false); active = false; } }, 4000);
      getMyReferrals().then((data) => {
        if (active) setUrl(listingShareUrl(window.location.origin, listingId, data.code));
      }).catch(() => {}).finally(() => {
        clearTimeout(timeout);
        if (active) setLoading(false);
      });
      return () => { active = false; clearTimeout(timeout); };
    }
    setLoading(false);
  }, [open, authenticated, listingId]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyFailed(false);
      trackGrowth('invite_copy_success', { placement: 'listing', method: 'copy' });
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div ref={container} className="relative">
      <Button ref={trigger} type="button" variant="outline" className={cn("min-h-11 rounded-xl", className)} aria-expanded={open} aria-controls={regionId} onClick={() => setOpen((value) => !value)}>
        <Share2 aria-hidden className="h-4 w-4" /> {label}
      </Button>
      {open && (
        <div id={regionId} role="region" aria-label="E’lonni do‘stga yuborish" className={`z-30 max-h-[calc(100dvh-var(--marketplace-bottom-bar-height,6rem)-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card-hover ${placement === 'above' ? 'fixed inset-x-4 bottom-[calc(var(--marketplace-bottom-bar-height,6rem)+0.5rem)] md:absolute md:inset-x-auto md:right-0 md:bottom-full md:mb-2 md:w-72' : 'absolute right-0 top-full mt-2 w-72'}`}>
          <p className="text-sm font-semibold">Shu akkount do‘stingizga mosmi?</p>
          <p className="text-xs leading-relaxed text-muted-foreground">E’lonni Telegramda yuboring yoki havolasini nusxalang.</p>
          {loading ? (
            <p role="status" className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Havola tayyorlanmoqda…</p>
          ) : url ? (
            <>
              <a href={telegramListingShareUrl(url, title)} target="_blank" rel="noopener noreferrer"
                onClick={() => trackGrowth('invite_share_intent', { placement: 'listing', method: 'telegram' })}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Send aria-hidden className="h-4 w-4" /> Telegramda yuborish
              </a>
              <Button type="button" variant="outline" className="min-h-11 w-full rounded-xl" onClick={copy}>
                {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />} Havolani nusxalash
              </Button>
            </>
          ) : null}
          {copied && <p role="status" className="text-xs text-primary">Nusxalandi. Endi do‘stingizga yuboring.</p>}
          {copyFailed && <label className="block space-y-2 text-xs text-muted-foreground"><span role="status">Nusxalanmadi. Havolani tanlab, qo‘lda nusxalang.</span><input aria-label="E’lon havolasi" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-h-11 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground" /></label>}
        </div>
      )}
    </div>
  );
}
