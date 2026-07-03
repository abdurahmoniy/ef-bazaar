'use client';

import { useState, useTransition, type MouseEvent } from 'react';
import { Heart } from 'lucide-react';

import { toggleListingLike } from '@/lib/marketplace-actions';
import { formatCompactNumber } from '@/lib/marketplace-format';
import { cn } from '@/lib/utils';

interface ListingLikeButtonProps {
  listingId: string;
  initialLiked: boolean;
  initialCount: number;
  /** When false (viewer is anonymous), clicking redirects to /auth/login. */
  authenticated: boolean;
  /** Extra classes for positioning within the card. */
  className?: string;
}

export function ListingLikeButton({
  listingId,
  initialLiked,
  initialCount,
  authenticated,
  className,
}: ListingLikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!authenticated) {
      window.location.href = `/auth/login?from=/marketplace/${listingId}`;
      return;
    }
    const nextLiked = !liked;
    const nextCount = Math.max(0, count + (nextLiked ? 1 : -1));
    setLiked(nextLiked);
    setCount(nextCount);
    startTransition(async () => {
      const result = await toggleListingLike(listingId);
      if (!result.ok) {
        setLiked(!nextLiked);
        setCount(count);
        return;
      }
      setLiked(result.data.liked);
      setCount(result.data.totalLikes);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={liked}
      aria-label={liked ? 'Sevimlilardan olib tashlash' : "Sevimlilarga qo'shish"}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur transition',
        'hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
        isPending && 'opacity-70',
        className,
      )}
    >
      <Heart className={cn('h-3 w-3', liked && 'fill-white text-white')} />
      {count > 0 && <span>{formatCompactNumber(count)}</span>}
    </button>
  );
}
