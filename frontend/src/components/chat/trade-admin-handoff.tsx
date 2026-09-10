'use client';

import { UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tradeAdminTelegramHref, tradePlatformLabel } from '@/lib/trade-platform';

export function TradeAdminHandoff({ listingId, platform, amountUzs }: {
  listingId?: string | null;
  platform: unknown;
  amountUzs?: number;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
      <p className="flex items-center gap-2 font-bold text-foreground">
        <UserCog className="h-4 w-4 shrink-0" />
        {tradePlatformLabel(platform)} — admin orqali savdo
      </p>
      <p className="text-muted-foreground">
        Smart admin faqat Mobile akkountning Konami ID pochtasini o‘tkazish uchun ishlaydi.
        Steam va PlayStation akkountlarini topshirishda admin yordam beradi.
        Narx va shartlarni chatda kelishib olgach, adminga murojaat qiling.
      </p>
      <p className="text-muted-foreground">
        Telegram’da @abdurahmoniy ga tayyor murojaat matnini tekshirib yuborasiz. To‘lov va akkountni topshirish tartibini
        admin bilan kelishasiz; bu tugma hamyondan pul yechmaydi.
      </p>
      <Button asChild className="w-full">
        <a href={tradeAdminTelegramHref({ listingId, platform, amountUzs })} target="_blank" rel="noopener noreferrer">
          Kelishdik — adminga murojaat
        </a>
      </Button>
    </div>
  );
}
