'use client';

import type { PlayerCard } from '@/components/marketplace/card-picker';
import { cn } from '@/lib/utils';

/**
 * Image-only player tile in the eFootball card's portrait aspect ratio, so
 * the full card art is visible. Falls back to the player name in small text
 * when the card has no image or it fails to load.
 * Overlay controls (e.g. a remove button) go in {@code children}.
 */
export function PlayerCardTile({
  card,
  className,
  children,
}: {
  card: PlayerCard;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      title={card.name}
      className={cn(
        'relative block aspect-[12/17] w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted shadow-sm',
        className,
      )}
    >
      {card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt={card.name}
          loading="lazy"
          className="h-full w-full object-contain"
          onError={(event) => {
            (event.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <span className="grid h-full w-full place-items-center px-1 text-center text-[9px] font-bold leading-tight text-muted-foreground">
          {card.name}
        </span>
      )}
      {children}
    </span>
  );
}
