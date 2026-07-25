'use client';

import * as React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

import { isSafeInternalPath } from '@/lib/safe-redirect';

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
 * Auth'dan keyin qayerga qaytish:
 * 1. `?from=/...` bo'lsa (login sahifasiga server redirect qo'ygan) — o'sha yerga.
 *    Faqat ichki path qabul qilinadi (open-redirect himoyasi).
 * 2. Landing (`/`) da ochilgan bo'lsa (bot menyusidagi "Open mini app") —
 *    to'g'ridan-to'g'ri bozorga.
 * 3. Boshqa sahifada ochilgan bo'lsa — joriy sahifani qayta yuklaymiz
 *    (deep link allaqachon to'g'ri URL'da).
 * 4. Aks holda (auth sahifalari, from'siz) — /profile.
 */
function resolvePostLoginTarget(): string {
  const from = new URLSearchParams(window.location.search).get('from');
  if (from && isSafeInternalPath(from)) return from;
  const path = window.location.pathname;
  if (path === '/') return '/marketplace';
  if (!path.startsWith('/auth')) {
    return path + window.location.search;
  }
  return '/profile';
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

    // initData'ni fon `fetch` (server action) o'rniga TOP-LEVEL form POST bilan
    // yuboramiz. Route handler ({@code /api/telegram-webapp}) auth cookie'ni
    // 303-redirect javobining o'ziga yozadi va target'ga yo'naltiradi. Sabab:
    // Telegram Desktop'ning WebKitGTK webview'i fon-fetch javobidagi `Set-Cookie`'ni
    // ishonchli saqlamaydi (server auth muvaffaqiyatli bo'lsa ham user guest mode'da
    // qolardi) — cookie top-level navigatsiya javobida kelishi shart.
    //
    // Deep link saqlanadi: `resolvePostLoginTarget()` joriy `from`/path'ni hisoblab
    // yashirin `from` maydoniga qo'yadi; server uni sanitizatsiya qiladi.
    try {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/api/telegram-webapp';
      form.acceptCharset = 'utf-8';
      form.style.display = 'none';

      const addField = (name: string, value: string) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      };
      addField('initData', initData);
      addField('from', resolvePostLoginTarget());
      // Kontekst: iframe (Telegram Web) → cookie `SameSite=None` bo'lishi kerak;
      // native webview (Desktop/mobil, top-level) → `Lax` (WebKitGTK ITP uchun).
      addField('framed', window.self !== window.top ? '1' : '0');

      document.body.appendChild(form);
      form.submit();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Telegram Mini App auth ishlamadi');
      setState('error');
    }
  }, []);

  if (state === 'idle') return null;

  if (state === 'authing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur">
        <div className="rounded-xl border border-border bg-white px-6 py-5 shadow-card-hover">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-foreground">Telegram orqali avtomatik kirilmoqda…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed left-4 right-4 top-4 z-50">
      <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-white px-4 py-3 text-sm text-destructive shadow-card-hover">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error ?? 'Mini App auth muvaffaqiyatsiz'}</span>
      </div>
    </div>
  );
}
