'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, AlertCircle, RefreshCw, Send } from 'lucide-react';

import { TelegramLogin } from '@/components/auth/telegram-login';
import { linkTelegramAction } from '@/app/auth/actions';
import type { TelegramAuthData } from '@/lib/types';
import { Button } from '@/components/ui/button';

interface LinkTelegramButtonProps {
  botUsername: string;
  alreadyLinked: boolean;
  telegramUsername?: string | null;
  onLinked?: () => void;
}

/**
 * Profile'da Telegram ulash — Google-first user'lar uchun. Widget bot
 * tomonidan signed payload beradi, biz uni {@code /auth/telegram/link} ga
 * yuboramiz. Backend {@code 409 telegram_already_linked}'ni aniq qaytaradi;
 * shu holatlarni user'ga xavotirsizroq xabar sifatida ko'rsatamiz.
 *
 * Render failures can have several causes. Offer a fresh widget load and
 * support without guessing at configuration or sending users to a bot that
 * cannot link this existing account by itself.
 */
export function LinkTelegramButton({
  botUsername,
  alreadyLinked,
  telegramUsername,
  onLinked,
}: LinkTelegramButtonProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [widgetAttempt, setWidgetAttempt] = React.useState(0);
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
    onLinked?.();
    router.refresh();
  }, [router, onLinked]);

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

  function retryWidget() {
    if (renderIssue === 'missing_bot') router.refresh();
    setRenderIssue(null);
    setWidgetAttempt((attempt) => attempt + 1);
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <TelegramLogin
        key={widgetAttempt}
        botUsername={botUsername}
        size="large"
        cornerRadius={12}
        onAuth={onAuth}
        onRenderIssue={setRenderIssue}
      />
      {renderIssue && (
        <div role="alert" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">
                {renderIssue === 'missing_bot'
                  ? 'Telegram orqali ulanish hozir mavjud emas.'
                  : 'Telegram tugmasi yuklanmadi.'}
              </p>
              <p className="text-sm leading-relaxed">
                {renderIssue === 'missing_bot'
                  ? 'Birozdan keyin qayta urinib ko‘ring. Muammo davom etsa, yordam markaziga murojaat qiling.'
                  : 'Internet aloqasini tekshirib, qayta urinib ko‘ring. Muammo davom etsa, yordam markaziga murojaat qiling.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={retryWidget}>
              <RefreshCw /> Qayta urinish
            </Button>
            <Button asChild variant="ghost">
              <Link href="/help">Yordam markazi</Link>
            </Button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Send className="h-3 w-3" />
        Telegram akkauntingizni ushbu hisobga ulang.
      </p>
    </div>
  );
}
