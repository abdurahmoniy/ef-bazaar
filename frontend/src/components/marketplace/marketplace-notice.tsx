import type { MarketplaceNotice } from '@/lib/marketplace-page-loader';

export const MARKETPLACE_NOTICE_TEXT: Record<MarketplaceNotice, string> = {
  feed_empty:
    "Hali siz uchun tanlov yo'q — e'lonlarga like bosing yoki Dream Team tuzing. Hozircha Katta bozor ko'rsatilmoqda.",
  rec_unavailable: "Shaxsiy tanlov hozir ishlamayapti — Katta bozor ko'rsatilmoqda.",
};

export function MarketplaceNoticeBanner({ notice }: { notice: MarketplaceNotice }) {
  return (
    <p role="status" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {MARKETPLACE_NOTICE_TEXT[notice]}
    </p>
  );
}
