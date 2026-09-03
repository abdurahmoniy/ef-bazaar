'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Ban, CheckCircle2, Handshake, Loader2, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PartnerPanelBlocks } from '@/components/partners/partner-panel/panel-blocks';

import { cancelPartnership, getMyApplication, type PartnerApplication } from '@/lib/partners';

/**
 * Hamkor boshqaruv paneli.
 *
 * <p>Holat va kanal shu yerda; narx, voronka, daromad va postlar
 * {@code PartnerPanelBlocks} ichida. Ajratilgan, chunki bu fayl
 * hamkorlik holatini ko'rsatadi va uni to'xtatish tugmasini saqlaydi —
 * reklama bozorining bloklari esa butunlay boshqa narsa.
 */
export function PartnerDashboard() {
  const [application, setApplication] = useState<PartnerApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    getMyApplication()
      .then(setApplication)
      .catch(() => setApplication(null))
      .finally(() => setLoading(false));
  }, []);

  async function cancel() {
    if (!window.confirm(
      "Hamkorlik to'xtatilsinmi? Hamkor maqomi olib tashlanadi va to'lov " +
      "avtomatik qaytarilmaydi. Qayta hamkor bo'lish uchun yangi ariza kerak.",
    )) return;
    setError(null);
    setCancelling(true);
    try {
      await cancelPartnership();
      // Rol olib tashlangach bu sahifa hamkor bo'lmagan odam uchun yopiq —
      // uni ariza sahifasiga qaytaramiz.
      router.push('/partnership');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'To‘xtatib bo‘lmadi');
      setCancelling(false);
    }
  }

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

      <PartnerPanelBlocks />

      {/*
        Xavfli hudud — qaytarib bo'lmaydigan amal uchun alohida joy.
        Boshqa tugmalar orasida tursa tasodifan bosilishi mumkin, oqibati
        esa maqomning yo'qolishi.
      */}
      <section className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Xavfli hudud
        </h2>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <p className="text-sm text-muted-foreground">
          Hamkorlikni to&apos;xtatsangiz hamkor maqomi olib tashlanadi va bu panel
          yopiladi. To&apos;lov avtomatik qaytarilmaydi. Qayta hamkor bo&apos;lish
          uchun yangi ariza topshirish kerak.
        </p>

        <p className="text-xs text-muted-foreground">
          Botni kanaldan chiqarsangiz ham hamkorlik avtomatik to&apos;xtaydi — bot
          usiz obunachilar sonini tekshira olmaydi.
        </p>

        <Button
          variant="outline"
          onClick={cancel}
          disabled={cancelling}
          className="gap-2 border-destructive/50 text-destructive"
        >
          {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
          Hamkorlikni to&apos;xtatish
        </Button>
      </section>
    </div>
  );
}
