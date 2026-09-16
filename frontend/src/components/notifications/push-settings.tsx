'use client';
import { Bell, BellRing } from 'lucide-react';
import { usePushNotifications } from './push-provider';

const descriptions = {
  loading: 'Bildirishnoma sozlamalari tekshirilmoqda…',
  available: 'Yangi xabar va savdo yangiliklarini sayt yopiq bo‘lsa ham oling.',
  enabled: 'Bu qurilmada yangi xabar va savdo yangiliklari yuboriladi.',
  denied: 'Bildirishnomalar bloklangan. Brauzerning sayt sozlamalarida ruxsat bering.',
  unsupported: 'Bu brauzer bildirishnomalarni qo‘llamaydi. Saytni telefon brauzerida oching.',
  install: 'iPhone’da saytni ulashish menyusidan “Bosh ekranga qo‘shish” orqali o‘rnating. So‘ng bosh ekrandan ochib, bildirishnomalarni yoqing.',
  unconfigured: 'Telefon bildirishnomalari hozircha mavjud emas. Barcha xabarlarni shu sahifada ko‘rishingiz mumkin.',
  error: 'Ulanib bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.',
};
export function PushSettings() {
  const { state, busy, enable, disable, retry } = usePushNotifications();
  const Icon = state === 'enabled' ? BellRing : Bell;
  return (
    <section aria-label="Telefon bildirishnomalari" className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon aria-hidden className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">Telefon bildirishnomalari</h2>
          <p role="status" className="mt-1 text-xs leading-relaxed text-muted-foreground">{busy ? 'Sozlamalar saqlanmoqda…' : descriptions[state]}</p>
        </div>
      </div>
      {(state === 'available' || state === 'enabled' || state === 'error') && (
        <button type="button" disabled={busy} onClick={state === 'enabled' ? disable : state === 'error' ? retry : enable}
          className="mt-3 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50">
          {state === 'enabled' ? 'Bu qurilmada o‘chirish' : state === 'error' ? 'Qayta urinish' : 'Bildirishnomalarni yoqish'}
        </button>
      )}
    </section>
  );
}
