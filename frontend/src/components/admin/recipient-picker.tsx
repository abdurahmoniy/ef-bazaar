'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, UserCheck, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { searchTelegramUsers, type RecipientUser } from '@/lib/bot-broadcast';

interface RecipientPickerProps {
  selected: RecipientUser[];
  onChange: (selected: RecipientUser[]) => void;
}

function label(user: RecipientUser): string {
  const name = [user.telegramFirstName, user.telegramLastName].filter(Boolean).join(' ').trim();
  if (user.telegramUsername) return `@${user.telegramUsername}`;
  return name || user.email || String(user.telegramId);
}

/**
 * Xabar qabul qiluvchilarni qidirib tanlash.
 *
 * <p>Ro'yxatda FAQAT Telegramga ulanganlar chiqadi. Ulanmaganini ko'rsatish
 * foydasiz bo'lardi: uni tanlab bo'lardi, xabar esa yetmasdi va sabab
 * faqat jo'natishdan keyin ma'lum bo'lardi.
 */
export function RecipientPicker({ selected, onChange }: RecipientPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RecipientUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const selectedIds = useMemo(
    () => new Set(selected.map((u) => u.telegramId)),
    [selected],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Har bosishda so'rov yubormaymiz; yozish to'xtagach bittasi ketadi.
    const timer = setTimeout(async () => {
      const current = ++requestId.current;
      try {
        const page = await searchTelegramUsers(trimmed);
        // Kechikkan javob yangisining ustiga yozmasin — tez yozganda
        // javoblar tartibsiz qaytadi va ekranda eski natija qolib ketardi.
        if (current !== requestId.current) return;
        setResults(page.content);
        setError(null);
      } catch (e) {
        if (current !== requestId.current) return;
        setError(e instanceof Error ? e.message : 'Qidiruv ishlamadi');
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  function add(user: RecipientUser) {
    if (selectedIds.has(user.telegramId)) return;
    onChange([...selected, user]);
  }

  function remove(telegramId: number) {
    onChange(selected.filter((u) => u.telegramId !== telegramId));
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Username, ism, email, Telegram ID yoki user ID"
          className="pl-8"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {query.trim().length >= 2 && !loading && results.length === 0 && !error && (
        <p className="text-xs text-muted-foreground">
          Topilmadi. Telegramga ulanmagan foydalanuvchilar ro&apos;yxatda chiqmaydi.
        </p>
      )}

      {results.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {results.map((user) => {
            const already = selectedIds.has(user.telegramId);
            return (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => add(user)}
                  disabled={already}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-accent disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{label(user)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      ID {user.telegramId}
                    </span>
                  </span>
                  {already && <UserCheck className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-2">
          <p className="text-xs font-medium">Tanlangan: {selected.length}</p>
          <div className="flex flex-wrap gap-1.5">
            {selected.map((user) => (
              <span
                key={user.telegramId}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-2.5 pr-1 text-xs font-medium text-primary"
              >
                {label(user)}
                <button
                  type="button"
                  onClick={() => remove(user.telegramId)}
                  aria-label={`${label(user)} — olib tashlash`}
                  className="rounded-full p-0.5 transition hover:bg-primary/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
