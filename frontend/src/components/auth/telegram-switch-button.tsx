'use client';

import * as React from 'react';
import { Loader2, AlertCircle, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { telegramAuthAction } from '@/app/auth/actions';
import type { TelegramAuthData } from '@/lib/types';

interface TelegramSwitchButtonProps {
  /** Bot numeric ID — token'ning ":" gacha bo'lgan qismi. */
  botId: number;
  className?: string;
}

/**
 * "Boshqa Telegram nomer bilan kirish" tugmasi — logout'dan keyingi qayta-auth
 * uchun. `Telegram.Login.auth(...)` popup'ni ochadi, foydalanuvchi shu yerda
 * nomer kiritib qaytadi yoki boshqa akkauntga o'tadi.
 *
 * Popup blokirovkadan o'tib ketadi chunki tugma user-initiated click ichida
 * ochiladi.
 */
export function TelegramSwitchButton({ botId, className }: TelegramSwitchButtonProps) {
  const [pending, setPending] = React.useState(false);
  const [scriptReady, setScriptReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (window.Telegram?.Login) {
      setScriptReady(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.onload = () => setScriptReady(true);
    script.onerror = () => setError('Telegram skripti yuklanmadi');
    document.head.appendChild(script);
  }, []);

  const onClick = () => {
    if (!window.Telegram?.Login || !botId) return;
    setError(null);
    setPending(true);
    window.Telegram.Login.auth(
      { bot_id: botId, request_access: 'write', lang: 'uz' },
      (data) => {
        if (!data) {
          setPending(false);
          return;
        }
        telegramAuthAction(data as TelegramAuthData).then((res) => {
          if (res && !res.ok) {
            setError(res.error ?? 'Telegram auth ishlamadi');
            setPending(false);
          }
          // muvaffaqiyatli bo'lsa server action /profile'ga redirect qiladi
        });
      },
    );
  };

  const disabled = !scriptReady || pending || !botId;

  return (
    <div className={className}>
      <Button
        type="button"
        size="lg"
        className="w-full bg-[#229ED9] hover:bg-[#1c8ec5] text-white"
        onClick={onClick}
        disabled={disabled}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {pending ? 'Telegram oynasi ochildi…' : 'Boshqa Telegram nomer bilan kirish'}
      </Button>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
