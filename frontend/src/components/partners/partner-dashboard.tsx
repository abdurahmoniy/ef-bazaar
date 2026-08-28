'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Construction, Handshake, Loader2, Users } from 'lucide-react';

import { getMyApplication, type PartnerApplication } from '@/lib/partners';

/**
 * Hamkor boshqaruv paneli.
 *
 * <p>HOZIRCHA ASOSIY MA'LUMOTLARNI KO'RSATADI. To'liq panel keyingi
 * bosqichda quriladi — bu sahifa esa hozirdan mavjud bo'lishi kerak,
 * chunki menyudagi "Hamkor admin paneli" unga havola qiladi va
 * mavjud bo'lmagan sahifaga havola 404 beradi.
 */
export function PartnerDashboard() {
  const [application, setApplication] = useState<PartnerApplication | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyApplication()
      .then(setApplication)
      .catch(() => setApplication(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Handshake className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Hamkor paneli</h1>
          <p className="text-sm text-muted-foreground">Hamkorlik holati va kanalingiz.</p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Hamkorlik faol
          </p>
          {application?.channelTitle && (
            <div className="space-y-1 text-sm">
              <p className="font-semibold">{application.channelTitle}</p>
              {application.channelUsername && (
                <p className="text-xs text-muted-foreground">@{application.channelUsername}</p>
              )}
              {application.subscriberCount != null && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {application.subscriberCount.toLocaleString('uz-UZ')} obunachi
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        <Construction className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Panelning qolgan bo&apos;limlari tayyorlanmoqda.
        </span>
      </div>
    </div>
  );
}
