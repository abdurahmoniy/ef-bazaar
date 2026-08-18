'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, AlertCircle, ExternalLink, Send } from 'lucide-react';

import { TelegramLogin } from '@/components/auth/telegram-login';
import { linkTelegramAction } from '@/app/auth/actions';
import type { TelegramAuthData } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

interface LinkTelegramButtonProps {
  botUsername: string;
  alreadyLinked: boolean;
  telegramUsername?: string | null;
}

/**
 * Profile'da Telegram ulash — Google-first user'lar uchun. Widget bot
 * tomonidan signed payload beradi, biz uni {@code /auth/telegram/link} ga
 * yuboramiz. Backend {@code 409 telegram_already_linked}'ni aniq qaytaradi;
 * shu holatlarni user'ga xavotirsizroq xabar sifatida ko'rsatamiz.
 *
 * Widget domain'da avvaldan {@code /setdomain} bilan sozlangan bo'lishi kerak.
 * Sozlanmagan bo'lsa, Telegram jimgina hech narsa qaytarmaydi — shu holatni
 * {@link TelegramLogin.onRenderIssue} orqali aniqlab, user'ga aniq izoh
 * beramiz (fallback: botga to'g'ridan-to'g'ri o'tish).
 */
export function LinkTelegramButton({
  botUsername,
  alreadyLinked,
  telegramUsername,
}: LinkTelegramButtonProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [renderIssue, setRenderIssue] = React.useState<
    'missing_bot' | 'iframe_missing' | null
  >(null);

  const onAuth = React.useCallback(async (data: TelegramAuthData) => {
    setError(null);
    const res = await linkTelegramAction(data);
    if (!res.ok) {
      setError(res.error ?? 'Telegram ulanmadi');
      return;
    }
    router.refresh();
  }, [router]);

  if (alreadyLinked) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/30 px-4 py-3 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">Telegram ulangan</p>
            {telegramUsername && (
              <p className="text-xs text-muted-foreground truncate">@{telegramUsername}</p>
            )}
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 shrink-0">
          <Check className="h-3 w-3" />
          Tasdiqlangan
        </span>
      </div>
    );
  }

  const botDeepLink = botUsername ? `https://t.me/${botUsername}` : null;

  return (
    <div className="space-y-3">
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
        onAuth={onAuth}
        onRenderIssue={setRenderIssue}
      />
      {renderIssue && (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">
                {renderIssue === 'missing_bot'
                  ? 'Telegram bot sozlanmagan.'
                  : 'Telegram tugmasi ochilmadi.'}
              </p>
              <p className="text-xs text-amber-900/80">
                {renderIssue === 'missing_bot'
                  ? "Frontend'da NEXT_PUBLIC_TELEGRAM_BOT env variable to'ldirilmagan. Deploy'ni qayta yoqish kerak."
                  : `Bot @${botUsername} uchun BotFather'da /setdomain hozirgi sayt domenini qo'shishi zarur. Iltimos administratorga xabar bering yoki bot orqali to'g'ridan ulaning.`}
              </p>
              {botDeepLink && (
                <a
                  href={botDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 underline underline-offset-2"
                >
                  Botni ochish
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Send className="h-3 w-3" />
        Verified badge olish uchun Telegram akkountingizni ulang.
      </p>
    </div>
  );
}
