'use client';

import { useRef, useState, type MouseEvent } from 'react';
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
  const [isPending, setIsPending] = useState(false);
  const pendingRef = useRef(false);

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (pendingRef.current) return;
    if (!authenticated) {
      window.location.href = `/auth/login?from=/marketplace/${listingId}`;
      return;
    }

    pendingRef.current = true;
    setIsPending(true);
    const previousLiked = liked;
    const previousCount = count;
    const nextLiked = !previousLiked;
    const nextCount = Math.max(0, previousCount + (nextLiked ? 1 : -1));
    setLiked(nextLiked);
    setCount(nextCount);

    try {
      const result = await toggleListingLike(listingId);
      if (!result.ok) {
        setLiked(previousLiked);
        setCount(previousCount);
        return;
      }
      setLiked(result.data.liked);
      setCount(result.data.totalLikes);
    } catch {
      setLiked(previousLiked);
      setCount(previousCount);
    } finally {
      pendingRef.current = false;
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-busy={isPending}
      aria-pressed={liked}
      aria-label={liked ? 'Sevimlilardan olib tashlash' : "Sevimlilarga qo'shish"}
      className={cn(
        'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-black/60 px-2 text-[11px] font-semibold text-white backdrop-blur transition',
        'cursor-pointer touch-manipulation hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 active:bg-black/85',
        liked && 'bg-primary/90 hover:bg-primary',
        isPending && 'cursor-wait opacity-70',
        className,
      )}
    >
      <Heart className={cn('h-4 w-4', liked && 'fill-white text-white')} />
      {count > 0 && <span>{formatCompactNumber(count)}</span>}
    </button>
  );
}
