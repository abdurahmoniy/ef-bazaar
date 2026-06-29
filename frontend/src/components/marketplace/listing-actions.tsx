'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Heart, MessageCircle, ShoppingBag } from 'lucide-react';

import {
  addListingToCartAction,
  startListingChatAction,
  toggleListingLikeAction,
} from '@/app/marketplace/actions';
import { Button } from '@/components/ui/button';
import { formatCompactNumber } from '@/lib/marketplace-format';

interface ListingActionsProps {
  listingId: string;
  authenticated: boolean;
  initialLiked?: boolean | null;
  initialLikeCount: number;
}

export function ListingActions({
  listingId,
  authenticated,
  initialLiked,
  initialLikeCount,
}: ListingActionsProps) {
  const [liked, setLiked] = useState(Boolean(initialLiked));
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!authenticated) {
    return (
      <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
        <div className="grid grid-cols-2 gap-2">
          <Button asChild size="sm" className="rounded-[8px]">
            <Link href="/auth/login">Kirish</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="rounded-[8px]">
            <Link href="/auth/register">Telegram</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant={liked ? 'default' : 'outline'}
          size="sm"
          className="rounded-[8px]"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              setMessage(null);
              const result = await toggleListingLikeAction(listingId);
              if (!result.ok) {
                setMessage(result.error ?? 'Like saqlanmadi');
                return;
              }
              setLiked(Boolean(result.liked));
              setLikeCount(result.totalLikes ?? likeCount);
            });
          }}
        >
          <Heart className="h-4 w-4" />
          {formatCompactNumber(likeCount)}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-[8px]"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              setMessage(null);
              const result = await addListingToCartAction(listingId);
              setMessage(result.ok ? "Savatga qo'shildi" : result.error ?? "Savatga qo'shilmadi");
            });
          }}
        >
          <ShoppingBag className="h-4 w-4" />
          Savat
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-[8px]"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              setMessage(null);
              const result = await startListingChatAction(listingId);
              setMessage(result.ok ? 'Chat ochildi' : result.error ?? 'Chat ochilmadi');
            });
          }}
        >
          <MessageCircle className="h-4 w-4" />
          Chat
        </Button>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
