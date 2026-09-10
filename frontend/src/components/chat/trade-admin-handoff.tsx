'use client';

import Link from 'next/link';
import { UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tradeAdminSupportHref, tradePlatformLabel } from '@/lib/trade-platform';

export function TradeAdminHandoff({ chatId, listingId, platform, amountUzs }: {
  chatId: string;
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
        Murojaat matnini tekshirib yuborasiz. To‘lov va akkountni topshirish tartibini
        admin bilan kelishasiz; bu tugma hamyondan pul yechmaydi.
      </p>
      <Button asChild className="w-full">
        <Link href={tradeAdminSupportHref({ chatId, listingId, platform, amountUzs })}>
          Kelishdik — adminga murojaat
        </Link>
      </Button>
    </div>
  );
}
