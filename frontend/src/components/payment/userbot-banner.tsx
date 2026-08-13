import { CheckCircle2, TriangleAlert } from 'lucide-react';

import { formatListingDate } from '@/lib/marketplace-format';
import type { UserbotStatusResponse } from '@/lib/payment-types';

/**
 * Whether the Telegram userbot that watches the card SMS feed is alive.
 *
 * When it is not, `InvoiceService` refuses every new deposit request
 * platform-wide, so an admin needs to see that in one glance rather than infer
 * it from a growing pile of unattributed payments.
 *
 * The last sentence of the red state is load-bearing: money already sent is
 * *not* lost, it queues as an unmatched observation. Without saying so, a red
 * banner reads like an emergency it is not.
 */
export function UserbotBanner({ status }: { status: UserbotStatusResponse }) {
  // `formatListingDate` rather than `toLocaleString`: Tashkent time, same
  // format as every other timestamp in the panel, and identical on server and
  // client (a locale-dependent format would hydrate differently).
  const lastSeen = status.lastSeenAt ? formatListingDate(status.lastSeenAt) : null;

  if (status.healthy) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          To&apos;lov kuzatuvchisi ishlayapti
          {lastSeen && ` · oxirgi signal ${lastSeen}`}
        </span>
      </p>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-black">To&apos;lov kuzatuvchisi javob bermayapti</p>
        <p>
          Yangi hisob to&apos;ldirish so&apos;rovlari qabul qilinmayapti.
          {lastSeen ? ` Oxirgi signal: ${lastSeen}.` : ' Hech qanday signal olinmadi.'}{' '}
          Kelgan pullar yo&apos;qolmaydi — ular tekshirilmagan tushumlar ro&apos;yxatiga tushadi.
        </p>
      </div>
    </div>
  );
}
