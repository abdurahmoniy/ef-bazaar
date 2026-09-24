'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { Loader2, Search, X } from 'lucide-react';

/**
 * Katalogni egasi bo'yicha suzish maydoni.
 *
 * <p>Holat havolada turadi (`?owner=`), komponentda emas: admin natijani
 * yuborishi, yangi tabda ochishi va orqaga qaytishi mumkin bo'lsin.
 * Sahifaning o'zi server komponenti, ya'ni suzish SSR da bajariladi.
 */
export function AdminListingOwnerSearch({
  status,
  query,
  activeLabel,
}: {
  status?: string;
  /** Oldingi qidiruv matni — maydonda ko'rinib turadi. */
  query?: string;
  /** Suzgich yoqilgan bo'lsa kimniki ekani; yorliqni ko'rsatish uchun. */
  activeLabel?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(query ?? '');
  const [pending, startTransition] = useTransition();

  function go(nextQuery: string, ownerId?: string) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (nextQuery) params.set('owner', nextQuery);
    if (ownerId) params.set('ownerId', ownerId);
    startTransition(() => router.push(`/admin/listings?${params.toString()}`));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Yangi qidiruvda eski tanlov bekor bo'ladi: aks holda matn
    // o'zgaradi-yu, katalog eski odamnikida qolardi.
    go(value.trim());
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Egasi: username yoki ism"
          aria-label="E'lon egasini qidirish"
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
      {activeLabel && (
        <button
          type="button"
          onClick={() => {
            setValue('');
            go('');
          }}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 text-sm font-semibold text-foreground"
        >
          {activeLabel}
          <X className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">Egasi bo‘yicha suzgichni olib tashlash</span>
        </button>
      )}
    </form>
  );
}
