import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { BackLink } from '@/components/navigation/back-link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getMe } from '@/lib/auth';
import { getListing } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "E'lonni tahrirlash",
  robots: { index: false, follow: false },
};

interface EditPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditListingPage({ params }: EditPageProps) {
  const { id } = await params;
  const user = await getMe();
  if (!user) redirect(`/auth/login?from=/marketplace/${id}/edit`);

  const listing = await getListing(id);
  if (!listing) notFound();
  if (listing.sellerId !== user.id) redirect(`/marketplace/${id}`);

  return (
    <MarketplaceShell user={user} activeTab="profile" hideSearch>
      <section className="mx-auto w-full max-w-2xl space-y-4">
        <BackLink href={`/marketplace/${id}`} label="E'lon" />
        <header>
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Marketplace</p>
          <h1 className="mt-1 text-2xl font-black text-foreground">E'lonni tahrirlash</h1>
        </header>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              Tahrirlash funksiyasi tez orada qo'shiladi. Hozircha e'lonni o'chirib, yangisini yaratish mumkin.
            </p>
            <div className="mt-4 flex gap-2">
              <Button asChild variant="outline">
                <Link href={`/marketplace/${id}`}>
                  <ArrowLeft className="h-4 w-4" /> Ortga
                </Link>
              </Button>
              <Button asChild>
                <Link href="/marketplace/new">Yangi e'lon</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </MarketplaceShell>
  );
}
