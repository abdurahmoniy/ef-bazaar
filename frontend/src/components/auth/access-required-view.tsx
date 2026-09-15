'use client';

import * as React from 'react';
import { AlertTriangle, ArrowUpRight, Check, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

import { readMiniAppInitData, submitTelegramWebAppLogin } from '@/components/auth/telegram-webapp-auto-login';
import { Button } from '@/components/ui/button';
import type { AccessRequirement } from '@/lib/access-requirements';
import { listingMediaUrl } from '@/lib/marketplace-media';
import { cn } from '@/lib/utils';

/**
 * "Tekshirish" bosilganini qayta yuklashdan keyin ham bilish uchun. Qayta
 * kirish yana shu sahifaga qaytsa — demak hali hammasi bajarilmagan va
 * foydalanuvchiga buni aytish kerak, aks holda tugma "ishlamayapti" ko'rinadi.
 */
const CHECK_PENDING_KEY = 'efbazaar.accessRequired.checkPending';

interface AccessRequiredViewProps {
  requirements: AccessRequirement[];
  from: string;
}

export function AccessRequiredView({ requirements, from }: AccessRequiredViewProps) {
  const [opened, setOpened] = React.useState<Set<string>>(new Set());
  const [checking, setChecking] = React.useState(false);
  const [stillUnmet, setStillUnmet] = React.useState(false);

  React.useEffect(() => {
    try {
      if (window.sessionStorage.getItem(CHECK_PENDING_KEY)) {
        window.sessionStorage.removeItem(CHECK_PENDING_KEY);
        setStillUnmet(true);
      }
    } catch {
      // storage yo'q — ogohlantirishsiz ishlaydi
    }
  }, []);

  const openRequirement = (requirement: AccessRequirement) => {
    if (!requirement.url) return;
    setOpened((prev) => new Set(prev).add(requirement.id));
    // Mini App ichida t.me havolasini Telegram o'zi ochadi — webview'dan
    // chiqib ketmaydi va kanal to'g'ridan-to'g'ri "Join" bilan ochiladi.
    const webApp = window.Telegram?.WebApp as { openTelegramLink?: (url: string) => void } | undefined;
    if (webApp?.openTelegramLink && requirement.url.startsWith('https://t.me/')) {
      webApp.openTelegramLink(requirement.url);
      return;
    }
    window.open(requirement.url, '_blank', 'noopener,noreferrer');
  };

  const check = () => {
    setChecking(true);
    setStillUnmet(false);
    try {
      window.sessionStorage.setItem(CHECK_PENDING_KEY, '1');
    } catch {
      // storage yo'q — ogohlantirish chiqmaydi, tekshiruv baribir ketadi
    }

    const initData = readMiniAppInitData();
    if (initData) {
      submitTelegramWebAppLogin(initData, from);
      return;
    }
    // Brauzer: Telegram Login Widget orqali qayta kirish.
    window.location.assign(`/auth/login?${new URLSearchParams({ from }).toString()}`);
  };

  const doneCount = requirements.filter((r) => opened.has(r.id)).length;

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
      />

      <div className="relative w-full max-w-md space-y-6">
        <header className="space-y-3 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg shadow-primary/30">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Bir qadam qoldi</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            efBazaar&apos;dan foydalanish uchun quyidagi {requirements.length > 1 ? 'kanallarga' : 'kanalga'} obuna
            bo&apos;ling, so&apos;ng pastdagi tugmani bosing.
          </p>
        </header>

        {stillUnmet && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Hali barcha shartlar bajarilmagan. Obuna bo&apos;lganingizni tekshirib, qayta urinib ko&apos;ring.</span>
          </div>
        )}

        {requirements.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1 text-xs font-semibold text-muted-foreground">
              <span>Shartlar</span>
              <span>
                {doneCount}/{requirements.length}
              </span>
            </div>
            <ol className="space-y-2.5">
              {requirements.map((requirement, index) => (
                <RequirementRow
                  key={requirement.id}
                  index={index + 1}
                  requirement={requirement}
                  opened={opened.has(requirement.id)}
                  onOpen={() => openRequirement(requirement)}
                />
              ))}
            </ol>
          </section>
        )}

        <Button size="lg" className="w-full" onClick={check} disabled={checking}>
          {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {checking ? 'Tekshirilmoqda…' : "Obuna bo'ldim — tekshirish"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Obuna bo&apos;lgach bir necha soniya kutib turing — Telegram yangilanishiga vaqt kerak bo&apos;lishi mumkin.
        </p>
      </div>
    </main>
  );
}

function RequirementRow({
  index,
  requirement,
  opened,
  onOpen,
}: {
  index: number;
  requirement: AccessRequirement;
  opened: boolean;
  onOpen: () => void;
}) {
  const title = requirement.title || (requirement.username ? `@${requirement.username}` : 'Kanal');
  const photo = requirement.photoFileId ? listingMediaUrl(requirement.photoFileId) : null;

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm transition',
        opened ? 'border-emerald-500/40' : 'border-border',
      )}
    >
      <div className="relative shrink-0">
        <ChannelAvatar title={title} photo={photo} />
        <span
          className={cn(
            'absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card text-[10px] font-bold',
            opened ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground',
          )}
        >
          {opened ? <Check className="h-3 w-3" /> : index}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        {requirement.username && (
          <p className="truncate text-xs text-muted-foreground">@{requirement.username}</p>
        )}
      </div>

      <Button
        size="sm"
        variant={opened ? 'outline' : 'default'}
        onClick={onOpen}
        disabled={!requirement.url}
        className="shrink-0"
      >
        {opened ? 'Ochildi' : "Obuna bo'lish"}
        <ArrowUpRight />
      </Button>
    </li>
  );
}

export function ChannelAvatar({ title, photo, className }: { title: string; photo: string | null; className?: string }) {
  const [broken, setBroken] = React.useState(false);
  const initial = title.replace(/^@/, '').trim()[0]?.toUpperCase() ?? '#';

  if (photo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        onError={() => setBroken(true)}
        className={cn('h-11 w-11 rounded-full object-cover ring-1 ring-border', className)}
      />
    );
  }
  return (
    <div
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-base font-bold text-white',
        className,
      )}
    >
      {initial}
    </div>
  );
}
