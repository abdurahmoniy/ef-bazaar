import Link from 'next/link';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';

import { formatPriceUZS } from '@/lib/marketplace-format';
import { listingMediaUrls } from '@/lib/marketplace-media';
import type { ListingResponse } from '@/lib/marketplace-types';

interface ChatPinnedHeaderProps {
  listing: ListingResponse | null;
}

/**
 * Rendered at the very top of the chat message stream (scrolls away with
 * content, like Telegram's channel description). Two blocks:
 *
 * 1. Listing card — the whole reason this chat exists. Centred, photo +
 *    title + price + a clear "open listing" jump. Deliberately not sticky so
 *    it doesn't fight message reading; users can always tap the partner name
 *    strip above to come back up.
 *
 * 2. Rules panel — the three chat rules (auto-close, "Muhim" exempts,
 *    payment-verification tip) styled as a subtle system note so it reads
 *    like a pinned first-message rather than a UI callout.
 */
export function ChatPinnedHeader({ listing }: ChatPinnedHeaderProps) {
  return (
    <div className="space-y-3 pb-3">
      {listing && <ListingCard listing={listing} />}
      <RulesCard />
    </div>
  );
}

function ListingCard({ listing }: { listing: ListingResponse }) {
  const cover = listingMediaUrls(listing, 1)[0];
  const title = listing.description.split('\n')[0]?.trim() || "E'lon";

  return (
    <Link
      href={`/marketplace/${listing.id}`}
      className="mx-auto block max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-card transition hover:border-primary/40 hover:shadow-card-hover"
    >
      {cover && (
        <div className="aspect-[19.5/9] w-full overflow-hidden bg-muted">
          <img
            src={cover}
            alt={`${title} rasmi`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            E'lon
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-foreground">
            {title}
          </p>
          <p className="mt-1 text-base font-black text-primary">
            {formatPriceUZS(listing.price)}
            {listing.priceNegotiable && (
              <span className="ml-1 text-[10px] font-bold uppercase text-muted-foreground">
                · savdolashsa bo'ladi
              </span>
            )}
          </p>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

function RulesCard() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-muted/40 px-4 py-3 text-[11.5px] leading-5 text-muted-foreground">
      <div className="mb-1 flex items-center gap-1.5 text-foreground/80">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span className="font-bold uppercase tracking-wider">Chat qoidalari</span>
      </div>
      <ul className="list-disc space-y-0.5 pl-4">
        <li>Chat 24 soatdan keyin avtomatik yopiladi.</li>
        <li>"Muhim" deb belgilangan chat yopilmaydi.</li>
        <li>To'lov haqidagi ma'lumotni tekshirib berishni so'rang.</li>
      </ul>
    </div>
  );
}
