'use client';

import * as React from 'react';

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
  /**
   * Widget renderi muvaffaqiyatsiz bo'lganda chaqiriladi ('missing_bot' —
   * bot username bo'sh; 'iframe_missing' — Telegram skripti yuklandi lekin
   * iframe hosil bo'lmadi, ehtimol bot domain'i sozlanmagan).
   */
  onRenderIssue?: (reason: 'missing_bot' | 'iframe_missing') => void;
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
  onRenderIssue,
}: TelegramLoginProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const callbackName = React.useId().replace(/[^a-zA-Z0-9_]/g, '_');

  React.useEffect(() => {
    if (!botUsername) {
      console.warn(
        '[TelegramLogin] Bot username bo\'sh — NEXT_PUBLIC_TELEGRAM_BOT env variable\'ni tekshiring.',
      );
      onRenderIssue?.('missing_bot');
      return;
    }

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

    // Domain sozlanmagan yoki bot username xato bo'lsa, Telegram jimgina hech
    // narsa qaytarmaydi. 4 soniya ichida iframe paydo bo'lmasa — user'ga aniq
    // xabar ko'rsatishimiz uchun onRenderIssue chaqiramiz.
    const timer = window.setTimeout(() => {
      const iframe = containerRef.current?.querySelector('iframe');
      if (!iframe) {
        console.warn(
          `[TelegramLogin] "@${botUsername}" widget iframe'i yuklanmadi — bot username yoki BotFather'da /setdomain sozlanganini tekshiring.`,
        );
        onRenderIssue?.('iframe_missing');
      }
    }, 4000);

    return () => {
      window.clearTimeout(timer);
      delete (window as unknown as Record<string, unknown>)[`tgAuth_${callbackName}`];
    };
  }, [botUsername, size, cornerRadius, requestAccess, callbackName, onAuth, onRenderIssue]);

  return (
    <div className="flex justify-center">
      <div ref={containerRef} />
    </div>
  );
}
