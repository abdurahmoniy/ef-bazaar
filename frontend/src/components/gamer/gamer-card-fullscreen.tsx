'use client';

import { useEffect, useState } from 'react';
import { Maximize2, X } from 'lucide-react';

import { GamerCardView } from '@/components/gamer/gamer-card-view';
import { ShareGamerCardButton } from '@/components/gamer/share-gamer-card-button';
import { Button } from '@/components/ui/button';
import type { GamerCardResponse } from '@/lib/gamer-types';

import './gamer-card.css';

interface GamerCardFullscreenProps {
  card: GamerCardResponse;
  /** Owner-only email line — same rule as GamerCardView. */
  email?: string | null;
  /** Capture root id of the off-screen full card the share button rasterizes. */
  captureId: string;
}

/**
 * "To'liq ko'rish" — kompakt kartani to'liq poster holida ochadi.
 *
 * Overlay o'zi Escape/scroll-lock bilan ishlaydi; ulashish tugmasi esa
 * off-screen capture host'ni suratga oladi, shuning uchun overlay ochiq
 * bo'lishi shart emas.
 */
export function GamerCardFullscreen({ card, email, captureId }: GamerCardFullscreenProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Maximize2 className="h-4 w-4" />
        To&apos;liq ko&apos;rish
      </Button>

      {open && (
        <div
          className="gc-viewer"
          role="dialog"
          aria-modal="true"
          aria-label="Gamer Card — to'liq ko'rinish"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="gc-viewer-inner">
            <div className="gc-viewer-bar">
              <button type="button" className="gc-viewer-close" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
                Yopish
              </button>
            </div>
            <GamerCardView card={card} email={email} />
            <div className="flex justify-center">
              <ShareGamerCardButton captureId={captureId} username={card.telegramUsername} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
