import Link from 'next/link';
import { Search } from 'lucide-react';

import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import { parsePage } from '@/lib/chat-admin';
import { getAdminChats } from '@/lib/chat-admin-server';
import { formatListingDate } from '@/lib/marketplace-format';

export const dynamic = 'force-dynamic';

interface AdminChatsPageProps {
  searchParams?: Promise<{ q?: string; page?: string; tab?: string }>;
}

/**
 * Every buyer–seller chat, most recently active first. Opening one is
 * anonymous and read-only — see the detail page.
 */
export default async function AdminChatsPage({ searchParams }: AdminChatsPageProps) {
  const params = searchParams ? await searchParams : {};
  const query = params.q?.trim() ?? '';
  const page = parsePage(params.page);
  // O'chirilgan chatlar ALOHIDA tabda: toza ro'yxat ichida aralashib
  // yurishi chalg'itardi. Ular yo'q qilinmaydi — nizo chiqqanda shu
  // yerdan ochib ko'rish mumkin.
  const deleted = params.tab === 'deleted';

  const result = await getAdminChats(query, page, 20, deleted);
  if (!result.ok) {
    return <ApiErrorPanel title="Chatlar yuklanmadi" error={result.error} />;
  }
  const { content, totalElements, totalPages } = result.data;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-foreground">Chatlar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Oluvchi va sotuvchi yozishmalari. Anonim ko&apos;rasiz — xabarlar o&apos;qilgan deb belgilanmaydi.
          </p>
          <nav className="mt-3 flex flex-wrap items-center gap-1.5">
            {[
              { value: 'active', label: 'Faol' },
              { value: 'deleted', label: "O'chirilgan" },
            ].map((tab) => {
              const isActive = tab.value === (deleted ? 'deleted' : 'active');
              const href = `/admin/chats?${new URLSearchParams({
                ...(query ? { q: query } : {}),
                ...(tab.value === 'deleted' ? { tab: 'deleted' } : {}),
              }).toString()}`;
              return (
                <Link
                  key={tab.value}
                  href={href}
                  className={
                    isActive
                      ? 'rounded-full border border-primary bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground'
                      : 'rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <form action="/admin/chats" className="flex w-full max-w-xs items-center gap-2">
          {deleted && <input type="hidden" name="tab" value="deleted" />}
          <label className="relative flex-1">
            <span className="sr-only">Ism bo&apos;yicha qidirish</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Ism bo'yicha qidirish"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-foreground"
            />
          </label>
        </form>
      </header>

      <p className="text-xs text-muted-foreground">{totalElements} ta chat</p>

      {content.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {query
            ? 'Bu qidiruv bo‘yicha chat topilmadi.'
            : deleted
              ? 'O‘chirilgan chat yo‘q.'
              : 'Hali chat yo‘q.'}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {content.map((chat) => (
            <li key={chat.id}>
              <Link href={`/admin/chats/${chat.id}`} className="block px-4 py-3 transition hover:bg-muted/40">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 text-sm text-foreground">
                    <span className="font-bold">{chat.buyerName ?? 'Oluvchi'}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="font-bold">{chat.sellerName ?? 'Sotuvchi'}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {chat.messageCount} xabar
                    {chat.lastMessageAt && ` · ${formatListingDate(chat.lastMessageAt)}`}
                  </span>
                </div>
                {chat.lastMessagePreview && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{chat.lastMessagePreview}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ListingsPagination
        page={page}
        totalPages={totalPages}
        buildHref={(target) =>
          `/admin/chats?${new URLSearchParams({
            ...(query ? { q: query } : {}),
            ...(deleted ? { tab: 'deleted' } : {}),
            page: String(target),
          }).toString()}`
        }
      />
    </div>
  );
}
