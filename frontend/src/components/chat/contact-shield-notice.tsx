'use client';

import { ShieldCheck } from 'lucide-react';

import { useTradeContext } from '@/components/chat/trade-context';

/**
 * Kontakt yashirilgan xabar ostidagi eslatma. Ikkala tomon ko'radi, lekin
 * matn har biriga o'z holatini aytadi: yozgan odamga — nima bo'ldi,
 * qabul qilganga — platformadan chiqsa nimani yo'qotadi.
 */
export function ContactShieldNoticeView({ mine, onOpenTrade }: { mine: boolean; onOpenTrade: () => void }) {
  return (
    <div role="note" className={`mt-1 flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="flex max-w-[85%] items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 space-y-1.5">
          <p className="text-foreground">
            {mine
              ? 'Xavfsizlik uchun kontakt yashirildi. Savdoni shu yerda davom ettiring — pul garovda turadi.'
              : 'Platformadan tashqarida savdo qilsangiz, efBazaar pulingizni himoya qila olmaydi.'}
          </p>
          <button
            type="button"
            onClick={onOpenTrade}
            className="min-h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Garov orqali savdo
          </button>
        </div>
      </div>
    </div>
  );
}

/** Savdo panelini (taklif, garov holati) ochadi — sotuvchi ham, xaridor ham shu yerdan boshlaydi. */
export function ContactShieldNotice({ mine }: { mine: boolean }) {
  const { setIsDrawerOpen } = useTradeContext();
  return <ContactShieldNoticeView mine={mine} onOpenTrade={() => setIsDrawerOpen(true)} />;
}
