'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';

import { TelegramLogin } from '@/components/auth/telegram-login';
import { TelegramSwitchHint } from '@/components/auth/telegram-switch-hint';
import { GoogleButton } from '@/components/auth/google-button';
import { Separator } from '@/components/ui/separator';
import { googleLoginAction, telegramAuthAction } from '@/app/auth/actions';
import type { TelegramAuthData } from '@/lib/types';

interface LoginFormProps {
  botUsername: string;
  googleClientId: string;
  /** Login'dan keyin qaytish manzili (`?from=` dan) — server action tekshiradi. */
  from?: string;
  initialError?: string | null;
}

export function LoginForm({ botUsername, googleClientId, from, initialError = null }: LoginFormProps) {
  const [error, setError] = React.useState<string | null>(initialError);
  const [pending, setPending] = React.useState(false);

  const onTelegram = React.useCallback(async (data: TelegramAuthData) => {
    setError(null);
    setPending(true);
    const res = await telegramAuthAction(data, from);
    setPending(false);
    if (!res.ok) setError(res.error ?? 'Telegram auth ishlamadi');
  }, [from]);

  const onGoogle = React.useCallback(async (idToken: string) => {
    setError(null);
    setPending(true);
    const res = await googleLoginAction(idToken, from);
    setPending(false);
    if (!res.ok) setError(res.error ?? 'Google login ishlamadi');
  }, [from]);

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
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

      <TelegramSwitchHint />

      {googleClientId && (
        <>
          <div className="relative">
            <Separator />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="bg-card px-3 text-xs uppercase tracking-wider text-muted-foreground">
                yoki
              </span>
            </span>
          </div>

          <GoogleButton
            clientId={googleClientId}
            onCredential={onGoogle}
            label="Google bilan kirish"
            disabled={pending}
          />
        </>
      )}
    </div>
  );
}
