'use client';

import { useState } from 'react';
import { ImageIcon } from 'lucide-react';

import type { UserAccountResponse } from '@/lib/accounts-types';
import { listingMediaUrl } from '@/lib/marketplace-media';

const PLATFORMS: Record<string, string> = { MOBILE: 'Mobile', STEAM: 'Steam', PLAYSTATION: 'PlayStation', XBOX: 'Xbox' };

/** Public account details only: never show the account email in the selling flow. */
export function SellingAccountSummary({ account }: { account: UserAccountResponse }) {
  const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null);
  const photo = account.mediaMessageIds[0] ? listingMediaUrl(account.mediaMessageIds[0]) : null;
  const platform = account.attributes.platform;
  const strength = account.attributes.team_strength;
  const summary = [
    typeof platform === 'string' ? PLATFORMS[platform] ?? platform : null,
    (typeof strength === 'number' || typeof strength === 'string') && String(strength).trim() ? `Jamoa kuchi ${strength}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground sm:h-[72px] sm:w-24">
        {photo && brokenPhoto !== photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" onError={() => setBrokenPhoto(photo)} className="h-full w-full object-cover" />
        ) : <ImageIcon className="h-6 w-6" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-words text-base font-bold text-foreground">{account.title?.trim() || 'Nomsiz akkount'}</p>
        {summary && <p className="mt-1 text-sm text-muted-foreground">{summary}</p>}
        <p className="mt-1 text-xs text-muted-foreground">{account.mediaMessageIds.length} ta rasm</p>
      </div>
    </div>
  );
}
