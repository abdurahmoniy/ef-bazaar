'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { searchUsers, userHint, userLabel, type FoundUser } from '@/lib/user-search';

interface UserPickerProps {
  selected: FoundUser | null;
  onChange: (user: FoundUser | null) => void;
  telegramOnly?: boolean;
  placeholder?: string;
  inputId?: string;
  /**
   * Terilgan matn, tanlovdan qat'i nazar.
   *
   * <p>Qidiruv qulaylik uchun, majburiyat emas: UUID ni boshqa joydan
   * olib kelgan admin uni yopishtirib qo'ya olishi kerak, ro'yxat
   * yuklanishini kutmasdan. Chaqiruvchi qiymatni o'zi tekshiradi.
   */
  onQueryChange?: (value: string) => void;
}

/**
 * Bitta foydalanuvchini qidirib tanlash.
 *
 * <p>UUID ni qo'lda terish o'rniga qidiruv qo'yilgan. Terilgan identifikator
 * to'g'ri SHAKLDA bo'lib, noto'g'ri ODAMNIKI bo'lishi mumkin — bunday xato
 * shaklni tekshirish bilan tutilmaydi va pulni biriktirishda uni qaytarib
 * ham bo'lmaydi. Ro'yxatdan tanlangan odam esa ekranda ko'rinib turadi.
 */
export function UserPicker({
  selected,
  onChange,
  telegramOnly = false,
  placeholder = 'Username, ism, email, Telegram ID yoki UUID',
  inputId,
  onQueryChange,
}: UserPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || selected) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Har bosishda so'rov yubormaymiz; yozish to'xtagach bittasi ketadi.
    const timer = setTimeout(async () => {
      const current = ++requestId.current;
      try {
        const found = await searchUsers(trimmed, { telegramOnly });
        // Kechikkan javob yangisining ustiga yozmasin — tez yozganda
        // javoblar tartibsiz qaytadi va eski natija ekranda qolardi.
        if (current !== requestId.current) return;
        setResults(found);
        setError(null);
      } catch (e) {
        if (current !== requestId.current) return;
        setError(e instanceof Error ? e.message : 'Qidiruv ishlamadi');
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, telegramOnly, selected]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{userLabel(selected)}</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {selected.id}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery('');
            onQueryChange?.('');
          }}
          aria-label="Tanlovni bekor qilish"
          className="rounded-full p-1 text-muted-foreground transition hover:bg-background hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onQueryChange?.(e.target.value.trim());
          }}
          placeholder={placeholder}
          className="pl-8"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {query.trim().length >= 2 && !loading && results.length === 0 && !error && (
        <p className="text-xs text-muted-foreground">Topilmadi.</p>
      )}

      {results.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
          {results.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => onChange(user)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{userLabel(user)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {userHint(user)}
                  </span>
                </span>
                <Check className="h-4 w-4 shrink-0 opacity-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
