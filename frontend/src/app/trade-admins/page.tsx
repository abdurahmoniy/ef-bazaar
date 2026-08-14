import type { Metadata } from 'next';
import { Search, UserCog } from 'lucide-react';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { TradeAdminCard } from '@/components/trade-admin/trade-admin-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { getMe } from '@/lib/auth';
import { resolveOptionalUser } from '@/lib/optional-auth';
import { getTradeAdmins } from '@/lib/trade-server';
import type { TradeAdminSort } from '@/lib/trade-types';
import { FEATURES } from '@/lib/feature-flags';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Inson adminlar',
};

interface PageProps {
  searchParams?: Promise<{ q?: string; sort?: string }>;
}

const SORTS: TradeAdminSort[] = ['DEFAULT', 'RATING', 'FEE_ASC'];

function parseSort(value: string | undefined): TradeAdminSort {
  return SORTS.includes(value as TradeAdminSort) ? (value as TradeAdminSort) : 'DEFAULT';
}

export default async function TradeAdminsPage({ searchParams }: PageProps) {
  // Human trade admin is closed for use (FEATURES.humanAdmin). notFound()
  // rather than a "coming soon" screen: the feature is not arriving, it is
  // switched off, and a 404 is the honest answer for a route with no way in.
  if (!FEATURES.humanAdmin) notFound();

  const params = searchParams ? await searchParams : {};
  const q = params.q?.trim() || undefined;
  const sort = parseSort(params.sort);
  const [user, admins] = await Promise.all([
    resolveOptionalUser(getMe),
    getTradeAdmins(q, sort),
  ]);

  return (
    <MarketplaceShell user={user} hideSearch>
      <div className="space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <UserCog className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-xl font-black text-foreground">Inson adminlar</h1>
                <p className="text-sm text-muted-foreground">
                  Inson admin savdoda platform email beradi, xaridor esa admin bilan bevosita hisob-kitob qiladi.
                </p>
              </div>
            </div>
          </div>

          <form action="/trade-admins" className="grid gap-2 sm:grid-cols-[240px,140px,auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" type="search" defaultValue={q ?? ''} placeholder="Admin ismi" className="pl-9" />
            </div>
            <Select name="sort" defaultValue={sort}>
              <option value="DEFAULT">Tavsiya</option>
              <option value="RATING">Reyting</option>
              <option value="FEE_ASC">Arzonroq</option>
            </Select>
            <Button type="submit">Qidirish</Button>
          </form>
        </header>

        <section className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          <span className="font-bold text-foreground">Muhim:</span> platform pulni ushlab turmaydi va pulni
          qaytarishni va'da qilmaydi. Admin reputatsiyasi asosiy himoya: reyting, yakunlangan
          savdolar, tashlab ketish va bekor qilish tarixini tekshiring.
        </section>

        {admins.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
            Admin topilmadi.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {admins.map((admin) => (
              <TradeAdminCard
                key={admin.userId}
                admin={admin}
                href={`/trade-admins/${admin.userId}`}
              />
            ))}
          </div>
        )}
      </div>
    </MarketplaceShell>
  );
}
