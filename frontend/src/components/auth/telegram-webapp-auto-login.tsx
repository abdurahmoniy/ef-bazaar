'use client';

import * as React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

import { telegramWebAppAuthAction } from '@/app/auth/actions';

/**
 * Telegram Mini App initData'ni URL hash'dan to'g'ridan-to'g'ri o'qiydi.
 *
 * Telegram client Mini App URL'ga shu ko'rinishda hash qo'shadi:
 *   #tgWebAppData=user%3D...%26auth_date%3D...%26hash%3D...&tgWebAppVersion=...&tgWebAppPlatform=...
 *
 * `tgWebAppData` qiymati — bu xuddi shu signed initData query-string (URL-decoded).
 * Biz `telegram-web-app.js` skriptidan mustaqil o'qiymiz — skript yuklash CSP yoki
 * tarmoq sababli kechikishi yoki bloklanishi mumkin.
 */
function readMiniAppInitData(): string | null {
  if (typeof window === 'undefined') return null;

  const raw = window.location.hash.replace(/^#/, '');
  if (raw) {
    const params = new URLSearchParams(raw);
    const data = params.get('tgWebAppData');
    if (data) return data;
  }

  // Fallback — skript allaqachon yuklangan bo'lsa
  return window.Telegram?.WebApp?.initData || null;
}

/**
 * Mini App context aniqlansa avtomatik login qiladi.
 *
 * Root layout'ga qo'yiladi → har qanday entry point'da (landing, /auth/login,
 * /auth/register va h.k.) ishlaydi. Mini App emas — `idle` qaytaradi, ya'ni
 * komponent ko'rinmaydi va oddiy UX'ga ta'sir qilmaydi.
 */
export function TelegramWebAppAutoLogin() {
  const [state, setState] = React.useState<'idle' | 'authing' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const initData = readMiniAppInitData();
    if (!initData) return;

    // Hash'ni tozalaymiz — keyingi sahifada qayta auth urinishi bo'lmasligi uchun
    if (window.location.hash) {
      window.history.replaceState({}, '', window.location.pathname + window.location.search);
    }

    setState('authing');
    telegramWebAppAuthAction(initData)
      .then((res) => {
        if (res && !res.ok) {
          setError(res.error ?? 'Telegram Mini App auth ishlamadi');
          setState('error');
        }
        // ok bo'lsa server action /profile'ga redirect qiladi
      })
      .catch((e: unknown) => {
        // Server action ichidagi `redirect()` Next.js ichki NEXT_REDIRECT signali'ni
        // tashlaydi — bu real xato emas. Qayta tashlaymiz, Next.js outer runtime
        // navigation'ni o'zi amalga oshirsin.
        const digest = (e as { digest?: unknown })?.digest;
        if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
          throw e;
        }
        setError(e instanceof Error ? e.message : 'Kutilmagan xato');
        setState('error');
      });
  }, []);

  if (state === 'idle') return null;

  if (state === 'authing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur">
        <div className="rounded-2xl border border-cyber-cyan/30 bg-card/95 px-6 py-5 shadow-glow-cyan">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-cyber-cyan" />
            <span className="text-sm text-foreground">Telegram orqali avtomatik kirilmoqda…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed left-4 right-4 top-4 z-50">
      <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/20 px-4 py-3 text-sm text-destructive backdrop-blur">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error ?? 'Mini App auth muvaffaqiyatsiz'}</span>
      </div>
    </div>
  );
}
