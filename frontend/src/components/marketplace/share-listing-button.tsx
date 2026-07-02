'use client';

import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getTelegramWebApp } from '@/lib/telegram';

interface ShareListingButtonProps {
  listingId: string;
  title: string;
}

export function ShareListingButton({ listingId, title }: ShareListingButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = new URL(`/marketplace/${listingId}`, window.location.origin).toString();

    const telegram = getTelegramWebApp();
    if (telegram) {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
      window.open(shareUrl, '_blank');
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // no-op
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={handleShare}>
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      {copied ? 'Nusxa olindi' : 'Ulashish'}
    </Button>
  );
}
