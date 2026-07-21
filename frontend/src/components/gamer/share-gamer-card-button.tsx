'use client';

import { useState } from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface ShareGamerCardButtonProps {
  /** DOM id of the card element to rasterize. */
  captureId: string;
  /** Used in the generated filename. */
  username?: string | null;
}

/**
 * "Kartani ulash" — rasterizes the card to PNG (html2canvas, client-only
 * dynamic import so it never lands in the server bundle). Mobile with Web
 * Share support gets the native share sheet (straight into Telegram);
 * desktop falls back to a download.
 */
export function ShareGamerCardButton({ captureId, username }: ShareGamerCardButtonProps) {
  const [busy, setBusy] = useState(false);

  async function share() {
    const node = document.getElementById(captureId);
    if (!node || busy) return;
    setBusy(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(node, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      );
      if (!blob) return;

      const fileName = `gamer-card-${username || 'efbazaar'}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Gamer Card — efBazaar' });
          return;
        } catch {
          // user dismissed the sheet — fall through to download
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={share} disabled={busy} className="gap-2">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
      Kartani ulash
      {!busy && <Download className="h-3.5 w-3.5 opacity-60" />}
    </Button>
  );
}
