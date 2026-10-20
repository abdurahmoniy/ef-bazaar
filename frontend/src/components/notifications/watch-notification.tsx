import Link from 'next/link';
import { formatCompactNumber } from '@/lib/marketplace-format';
import type { WatchNotificationPayload } from '@/lib/marketplace-types';

export function WatchNotification({ payload, onOpen }: { payload: WatchNotificationPayload; onOpen?: () => void }) {
  return <span className="block space-y-1 text-xs text-muted-foreground">
    {payload.items.map((item, index) => <span key={`${item.listingId}-${index}`} className="block break-words">
      <Link onClick={onOpen} className="inline-flex min-h-11 items-center font-semibold text-primary dark:text-secondary underline underline-offset-4" href={`/marketplace/${encodeURIComponent(item.listingId)}`}>{item.reasons.join(' · ') || 'E’lonni ko‘rish'}</Link>
      {item.oldPrice != null && item.newPrice != null && <span className="block font-semibold">{formatCompactNumber(item.oldPrice)} → {formatCompactNumber(item.newPrice)} so‘m</span>}
    </span>)}
    {payload.remainingCount > 0 && <span className="block font-semibold">Yana {payload.remainingCount} ta e’lon · kuzatuvlarni ochish</span>}
  </span>;
}
