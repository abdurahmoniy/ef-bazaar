'use client';

import * as React from 'react';
import Script from 'next/script';

import type { TelegramAuthData } from '@/lib/types';

interface TelegramLoginProps {
  /** Bot username — @ siz */
  botUsername: string;
  /** "large" yoki "medium" yoki "small" */
  size?: 'large' | 'medium' | 'small';
  /** corner radius (0-20) */
  cornerRadius?: number;
  /** photo'ni so'rashmi (Telegram default — true) */
  requestAccess?: 'write' | undefined;
  /** Auth muvaffaqiyatli bo'lganda chaqiriladi */
  onAuth: (data: TelegramAuthData) => void;
}

/**
 * Telegram Login Widget'ni o'rab oluvchi React komponenti.
 *
 * Telegram tomonidan taqdim etilgan `telegram-widget.js` iframe button hosil qiladi.
 * Browser'dagi `window.__onTelegramAuth__` global callback orqali natija qaytadi.
 *
 * Ssenariy:
 *   <TelegramLogin botUsername="EfBazaarBot" onAuth={(d) => login(d)} />
 *
 * Backend HMAC validatsiya — auth-service shu tokenni qabul qiladi.
 */
export function TelegramLogin({
  botUsername,
  size = 'large',
  cornerRadius = 12,
  requestAccess = 'write',
  onAuth,
}: TelegramLoginProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const callbackName = React.useId().replace(/[^a-zA-Z0-9_]/g, '_');

  React.useEffect(() => {
    // Global callback registratsiya — Telegram widget'i shuni chaqiradi.
    (window as unknown as Record<string, (d: TelegramAuthData) => void>)[
      `tgAuth_${callbackName}`
    ] = onAuth;

    // Widget iframe'ini qo'lda inject qilamiz (Script tag attribute'lari Next.js'da har doim ham ishlamaydi)
    if (containerRef.current && !containerRef.current.querySelector('script')) {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.async = true;
      script.setAttribute('data-telegram-login', botUsername);
      script.setAttribute('data-size', size);
      script.setAttribute('data-radius', String(cornerRadius));
      script.setAttribute('data-onauth', `tgAuth_${callbackName}(user)`);
      script.setAttribute('data-userpic', 'true');
      if (requestAccess) {
        script.setAttribute('data-request-access', requestAccess);
      }
      containerRef.current.appendChild(script);
    }

    return () => {
      delete (window as unknown as Record<string, unknown>)[`tgAuth_${callbackName}`];
    };
  }, [botUsername, size, cornerRadius, requestAccess, callbackName, onAuth]);

  return (
    <div className="flex justify-center">
      <div ref={containerRef} />
    </div>
  );
}
