'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';

import { TelegramLogin } from '@/components/auth/telegram-login';
import { telegramAuthAction } from '@/app/auth/actions';
import type { TelegramAuthData } from '@/lib/types';

export function RegisterForm({ botUsername }: { botUsername: string }) {
  const [error, setError] = React.useState<string | null>(null);

  const onTelegram = React.useCallback(async (data: TelegramAuthData) => {
    setError(null);
    const res = await telegramAuthAction(data);
    if (!res.ok) setError(res.error ?? 'Telegram auth ishlamadi');
  }, []);

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <TelegramLogin
        botUsername={botUsername}
        size="large"
        cornerRadius={12}
        onAuth={onTelegram}
      />
    </div>
  );
}
