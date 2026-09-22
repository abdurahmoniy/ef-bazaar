'use client';

import Link from 'next/link';
import React from 'react';
import { CheckCircle2, Clock, ExternalLink, Handshake, ShieldCheck, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MessageResponse } from '@/lib/marketplace-types';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { useTradeContext } from './trade-context';

interface TradeProposalMessageCardProps {
  message: MessageResponse;
  viewerId: string;
}

export function TradeProposalMessageCard({ message, viewerId }: TradeProposalMessageCardProps) {
  const { requiresAdminHandoff, proposal, listing, accountRequest,
    setShowAcceptModal, setIsDrawerOpen, openTrade } = useTradeContext();
  const isMine = message.senderId === viewerId;
  // Only an exact proposal match may contribute live details to this message.
  const matching = message.proposalId && message.proposalId === proposal?.id ? proposal : null;
  const rawPrice = message.content.trim() ? Number(message.content) : NaN;
  const price = Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : matching?.priceUzs;
  const kind = message.proposalKind ?? matching?.kind ?? (price === 0 ? 'SWAP' : undefined);
  const listingId = message.proposalListingId ?? matching?.listingId;
  const ownListing = listingId ? [listing, accountRequest?.listing].find(item => item?.id === listingId) : null;
  const expiresAt = message.proposalExpiresAt ?? matching?.expiresAt;
  const expired = !!expiresAt && Date.parse(expiresAt) <= Date.now();
  const recorded = message.proposalOutcome;
  const outcome = recorded && recorded !== 'PENDING' ? recorded
    : message.proposalTradeId ? 'ACCEPTED'
    : expired ? 'EXPIRED'
    : matching ? 'PENDING' : 'UNKNOWN';

  return (
    <div className="my-2 flex w-full justify-center px-2">
      <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Handshake className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-foreground">
                {kind === 'SWAP' || kind === 'SWAP_SURCHARGE' ? 'ALMASHISH TAKLIFI' : 'SAVDO TAKLIFI'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isMine ? 'Siz tomoningizdan yuborilgan' : 'Sizga taklif qilindi'}
              </p>
            </div>
          </div>
          {outcome === 'ACCEPTED' ? (
            <Badge variant="outline" className="gap-1 border-emerald-500/30 text-[11px] text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />Qabul qilingan
            </Badge>
          ) : outcome === 'REJECTED' ? (
            <Badge variant="outline" className="gap-1 border-destructive/30 text-[11px] text-destructive">
              <XCircle className="h-3 w-3" />Rad etilgan
            </Badge>
          ) : outcome === 'EXPIRED' ? (
            <Badge variant="outline" className="gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />Muddati tugagan
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[11px] text-muted-foreground">
              {outcome === 'PENDING' ? 'Kutilmoqda' : 'Holati noma’lum'}
            </Badge>
          )}
        </div>

        {listingId && (
          <Link href={`/marketplace/${encodeURIComponent(listingId)}`} className="block truncate text-sm font-medium text-foreground underline decoration-primary/50 underline-offset-4 hover:text-primary">
            {ownListing?.description?.split('\n')[0]?.trim() || 'Taklifdagi e’lonni ko‘rish'}
          </Link>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-xs text-muted-foreground">
            {kind === 'SWAP' ? 'Almashish sharti' : kind === 'SWAP_SURCHARGE' ? 'Doplata' : 'Taklif qilingan summa'}
          </p>
          <p className="text-base font-bold text-foreground">
            {kind === 'SWAP' ? 'Akkount almashish'
              : typeof price === 'number' && Number.isFinite(price) && price > 0 ? formatPriceUZS(price) : 'Summa ko‘rsatilmagan'}
          </p>
        </div>

        {outcome === 'PENDING' && matching ? (
          !isMine ? (
            <div className="flex gap-2">
              <Button type="button" size="sm" className="min-h-11 flex-1"
                onClick={() => requiresAdminHandoff ? setIsDrawerOpen(true) : setShowAcceptModal(true)}>
                <ShieldCheck className="h-4 w-4" />
                {requiresAdminHandoff ? 'Adminga murojaat' : 'Qabul qilish'}
              </Button>
              <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setIsDrawerOpen(true)}>Batafsil</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Javob kutilmoqda</span>
              <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => setIsDrawerOpen(true)}>Batafsil</Button>
            </div>
          )
        ) : outcome === 'ACCEPTED' && message.proposalTradeId ? (
          <Button type="button" size="sm" variant="outline" className="min-h-11 w-full"
            onClick={() => openTrade(message.proposalTradeId!, listingId)}>
            <ExternalLink className="h-4 w-4" />Savdo jarayonini ko&apos;rish
          </Button>
        ) : outcome === 'UNKNOWN' ? (
          <p className="text-xs text-muted-foreground">Bu taklifning joriy holati tasdiqlanmagan.</p>
        ) : null}
      </div>
    </div>
  );
}
