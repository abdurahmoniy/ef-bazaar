import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TelegramSwitchButton } from '@/components/auth/telegram-switch-button';

export const dynamic = 'force-dynamic';

export default function LogoutCompletePage() {
  const botId = Number(process.env.NEXT_PUBLIC_TELEGRAM_BOT_ID || '0');

  return (
    <Card>
      <CardHeader className="text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyber-cyan/15 text-cyber-cyan">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <CardTitle>Tizimdan chiqildi</CardTitle>
        <CardDescription>
          Boshqa Telegram nomer bilan kirmoqchimisiz? Telegram OAuth oynasini ochib,
          shu yerda yangi nomer kiritishingiz mumkin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {botId > 0 ? (
          <TelegramSwitchButton botId={botId} />
        ) : (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Telegram bot ID sozlanmagan (<code>NEXT_PUBLIC_TELEGRAM_BOT_ID</code>) —
            qayta-auth popup'i ishlamaydi.
          </div>
        )}

        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/login">Oddiy login sahifasiga</Link>
        </Button>

        <Button asChild variant="ghost" className="w-full">
          <Link href="/">Bosh sahifaga</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
