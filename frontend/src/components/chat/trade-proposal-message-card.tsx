'use client';

import Link from 'next/link';
import React, { useEffect } from 'react';
import { CheckCircle2, Clock, Handshake, ShieldCheck, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { canAcceptTradeProposal } from '@/lib/trade-types';
import { tradeProposalDetails } from '@/lib/trade-proposal-details';
import { formatMessageTime } from '@/lib/chat-format';
import type { MessageResponse } from '@/lib/marketplace-types';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { useTradeContext } from './trade-context';

interface TradeProposalMessageCardProps {
  message: MessageResponse;
  viewerId: string;
}

export function TradeProposalMessageCard({ message, viewerId }: TradeProposalMessageCardProps) {
  const { requiresAdminHandoff, proposal, listing, accountRequest,
    setShowAcceptModal, openProposal, viewedProposal } = useTradeContext();
  const isMine = message.senderId === viewerId;
  const { matching, price, kind, listingId, outcome } = tradeProposalDetails(message, proposal);
  const ownListing = listingId ? [listing, accountRequest?.listing].find(item => item?.id === listingId) : null;
  // Keep the selected request current when chat receives its resolution event.
  useEffect(() => {
    if (viewedProposal?.id === message.id && viewedProposal !== message) openProposal(message);
  }, [message, viewedProposal, openProposal]);

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
          !isMine && canAcceptTradeProposal(matching, viewerId) ? (
            <div className="flex gap-2">
              <Button type="button" size="sm" className="min-h-11 flex-1"
                onClick={() => requiresAdminHandoff ? openProposal(message) : setShowAcceptModal(true)}>
                <ShieldCheck className="h-4 w-4" />
                {requiresAdminHandoff ? 'Adminga murojaat' : 'Qabul qilish'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Javob kutilmoqda</span>
            </div>
          )
        ) : outcome === 'UNKNOWN' ? (
          <p className="text-xs text-muted-foreground">Bu taklifning joriy holati tasdiqlanmagan.</p>
        ) : null}
        <Button type="button" size="sm" variant="outline" className="min-h-11 w-full" onClick={() => openProposal(message)}>
          Batafsil
        </Button>
        <time dateTime={message.createdAt} className="block text-right text-[10px] tabular-nums text-muted-foreground">
          {formatMessageTime(message.createdAt)}
        </time>
      </div>
    </div>
  );
}
