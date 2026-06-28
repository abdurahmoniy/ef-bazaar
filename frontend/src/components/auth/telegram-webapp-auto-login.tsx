'use client';

import * as React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

import { telegramWebAppAuthAction } from '@/app/auth/actions';

/**
 * Telegram Mini App auto-login.
 *
 * Foydalanuvchi botning ichida Mini App'ni ochganida `window.Telegram.WebApp.initData`
 * mavjud bo'ladi (signed query-string). Ushbu komponent shu ma'lumotni o'qib, server
 * action chaqiradi va backend HMAC'ni tekshirib, tokens cookies o'rnatib /profile'ga
 * redirect qiladi.
 *
 * Oddiy browser kontekstida (initData yo'q) hech narsa render qilmaydi — Login Widget
 * va Google flow odatdagidek ko'rinadi.
 */
export function TelegramWebAppAutoLogin() {
  const [state, setState] = React.useState<'idle' | 'detecting' | 'authing' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    setState('detecting');

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    script.onload = () => {
      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) {
        setState('idle');
        return;
      }
      try {
        window.Telegram?.WebApp?.ready();
        window.Telegram?.WebApp?.expand?.();
      } catch {
        // ready/expand bo'lmasa ham auth davom etadi
      }
      setState('authing');
      telegramWebAppAuthAction(initData)
        .then((res) => {
          if (res && !res.ok) {
            setError(res.error ?? 'Telegram Mini App auth ishlamadi');
            setState('error');
          }
          // ok bo'lsa server action /profile'ga redirect qiladi — bu yerga yetib kelmaydi
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : 'Kutilmagan xato');
          setState('error');
        });
    };
    script.onerror = () => setState('idle');
    document.head.appendChild(script);
  }, []);

  if (state === 'idle' || state === 'detecting') return null;

  if (state === 'authing') {
    return (
      <div className="flex items-center justify-center gap-3 rounded-xl border border-cyber-cyan/30 bg-cyber-cyan/5 px-4 py-3 text-sm text-cyber-cyan">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Telegram orqali avtomatik kirilmoqda…</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{error ?? 'Mini App auth muvaffaqiyatsiz'}</span>
    </div>
  );
}
