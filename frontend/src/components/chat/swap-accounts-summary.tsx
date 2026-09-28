'use client';

import { ChevronRight } from 'lucide-react';
import type { SwapSide } from '@/lib/swap-accounts';
import { listingSide } from '@/lib/swap-accounts';
import { useTradeContext } from './trade-context';

function Thumb({ side, size }: { side: SwapSide; size: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-6 w-6 rounded' : 'h-10 w-10 rounded-md';
  return side.coverUrl
    ? <img src={side.coverUrl} alt="" className={`${cls} shrink-0 object-cover`} />
    : <span className={`${cls} shrink-0 bg-muted ${side.external ? 'border border-dashed border-border' : ''}`} aria-hidden="true" />;
}

function Column({ side, pending }: { side: SwapSide | null; pending?: boolean }) {
  if (!side) {
    return <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="h-10 w-10 shrink-0 rounded-md border border-dashed border-border" aria-hidden="true" />
      <span className="truncate text-xs text-muted-foreground">{pending ? 'Xaridor tanlaydi' : '—'}</span>
    </div>;
  }
  return <div className="flex min-w-0 flex-1 items-center gap-2">
    <Thumb side={side} size="md" />
    <span className="min-w-0">
      <span className={`block truncate text-xs font-medium ${side.external ? 'text-muted-foreground' : 'text-foreground'}`}>{side.title}</span>
      {side.teamStrength && <span className="block text-[11px] text-muted-foreground">TS {side.teamStrength}</span>}
    </span>
  </div>;
}

/** Taklif kartasida: chapda e'lon akkounti, o'ngda xaridor beradigani. */
export function SwapPair({ left, right, rightPending = false }: { left: SwapSide | null; right: SwapSide | null; rightPending?: boolean }) {
  return <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2">
    <Column side={left} />
    <span className="shrink-0 text-sm text-muted-foreground" aria-label="almashadi">⇄</span>
    <Column side={right} pending={rightPending} />
  </div>;
}

/** Pinned bar'dagi bitta qator — har kim faqat o'zi OLADIGANini ko'radi. */
export function ReceivedLine({ side }: { side: SwapSide }) {
  return <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
    <Thumb side={side} size="sm" />
    <span className="shrink-0">Siz olasiz:</span>
    <span className="truncate font-medium text-foreground">{side.title}</span>
    <ChevronRight className="ml-auto h-3 w-3 shrink-0" aria-hidden="true" />
  </span>;
}

/** Drawer: ikkala akkount to'liq. */
export function GiveReceiveBlock({ give, receive }: { give: SwapSide | null; receive: SwapSide | null }) {
  return <dl className="space-y-2 text-sm">
    <div><dt className="mb-1 text-xs text-muted-foreground">Siz berasiz</dt><dd><Column side={give} /></dd></div>
    <div><dt className="mb-1 text-xs text-muted-foreground">Siz olasiz</dt><dd><Column side={receive} /></dd></div>
  </dl>;
}

/** E'lon akkounti — chat kontekstidagi e'lon yoki so'ralgan akkountdan. */
export function useSwapListingSide(listingId?: string | null): SwapSide | null {
  const { listing, accountRequest } = useTradeContext();
  const request = accountRequest?.listing;
  if (request && (!listingId || request.id === listingId)) return listingSide(request);
  if (listing && (!listingId || listing.id === listingId)) return listingSide(listing);
  return null;
}
