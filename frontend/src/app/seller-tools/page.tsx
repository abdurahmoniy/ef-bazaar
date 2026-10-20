import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MarketplaceShell } from "@/components/marketplace/marketplace-shell";
import { SellerToolsView } from "@/components/seller-tools/seller-tools-view";
import { getMe } from "@/lib/auth";
import { getMyPlanSSR } from "@/lib/plans-server";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sotuvchi vositalari",
  robots: { index: false, follow: false },
};
export default async function SellerToolsPage({
  searchParams,
}: {
  searchParams?: Promise<{ chatId?: string; listingId?: string }>;
}) {
  const user = await getMe();
  const params = searchParams ? await searchParams : {};
  if (!user) {
    const query = new URLSearchParams();
    if (params.chatId) query.set("chatId", params.chatId);
    if (params.listingId) query.set("listingId", params.listingId);
    redirect(
      `/auth/login?from=${encodeURIComponent(`/seller-tools${query.size ? `?${query}` : ""}`)}`,
    );
  }
  // Initialize canonical Free identity; marketplace capabilities authorize all writes.
  await getMyPlanSSR();
  return (
    <MarketplaceShell user={user} hideSearch backHref="/profile">
      <SellerToolsView
        key={user.id}
        chatId={params.chatId}
        listingId={params.listingId}
      />
    </MarketplaceShell>
  );
}
