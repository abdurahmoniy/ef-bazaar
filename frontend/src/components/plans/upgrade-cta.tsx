import Link from 'next/link';
import { Link2Off, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { showUpgrade } from '@/lib/mailbox-lock';

/**
 * Tarifni oshirishga chaqiruv. Eng yuqori tarifda (`MAX`) oshirish yo'q:
 * u yerda faqat keraksiz qutini uzish yo'li ko'rsatiladi.
 */
export function UpgradeCta({
  message = 'Pochta qutilari joyi tugadi. Ko‘proq joy uchun tarifingizni oshiring',
  plan,
}: {
  message?: string;
  plan?: string;
}) {
  const upgrade = plan === undefined || showUpgrade(plan);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-foreground">
        {upgrade ? message : 'Pochta qutilari joyi tugadi. Keraksiz qutini o‘zingizdan uzing'}
      </p>
      <Button asChild size="sm" className="min-h-11 sm:min-h-9">
        {upgrade ? (
          <Link href="/plans"><Sparkles className="mr-1.5 h-4 w-4" aria-hidden />Tarifni oshirish</Link>
        ) : (
          <Link href="/profile#mailboxes"><Link2Off className="mr-1.5 h-4 w-4" aria-hidden />Qutilarni boshqarish</Link>
        )}
      </Button>
    </div>
  );
}
