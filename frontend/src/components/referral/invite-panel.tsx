'use client';

import { useEffect, useState } from 'react';
import { Bot, Check, Copy, Gift, Globe, Loader2, UserPlus, Users } from 'lucide-react';

import { inviteLinks } from '@/lib/referral-capture';
import { getMyReferrals, type MyReferrals } from '@/lib/referrals';

function som(value: number | null | undefined): string {
  if (!value) return '0';
  return value.toLocaleString('uz-UZ');
}

/** Bitta havola qatori: nom, havola va nusxalash tugmasi. */
function LinkRow({ label, icon, href }: { label: string; icon: React.ReactNode; href: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard rad etilishi mumkin (ruxsat yo'q, xavfsiz bo'lmagan
      // kontekst). Havolaning o'zi ekranda turibdi — qo'lda ham
      // nusxalash mumkin, shuning uchun xato ko'rsatmaymiz.
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
          {href}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={`${label}ni nusxalash`}
          className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-muted"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

/**
 * Foydalanuvchining taklif sahifasi.
 *
 * <p>Ikki havola beriladi va tanlash foydalanuvchiga qoldiriladi: bot
 * havolasi Telegram ichida ishonchliroq, sayt havolasi esa brauzerdan
 * kelganlarni va kelajakdagi mobil ilovani qamraydi.
 */
export function InvitePanel({ botUsername }: { botUsername: string }) {
  const [data, setData] = useState<MyReferrals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    getMyReferrals()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Yuklanmadi'))
      .finally(() => setLoading(false));
  }, []);

  const links = data && origin ? inviteLinks(data.code, origin, botUsername) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Do&apos;st taklif qilish</h1>
          <p className="text-sm text-muted-foreground">
            Havolangiz orqali kelgan odam birinchi savdosini yakunlasa, hisobingizga
            {data ? ` ${som(data.rewardSom)} ` : ' '}so&apos;m tushadi.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
        </div>
      ) : error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </p>
      ) : data ? (
        <>
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            {links?.bot && (
              <LinkRow label="Bot havolasi" icon={<Bot className="h-3.5 w-3.5" />} href={links.bot} />
            )}
            {links && (
              <LinkRow label="Sayt havolasi" icon={<Globe className="h-3.5 w-3.5" />} href={links.site} />
            )}
          </section>

          <section className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Taklif qilingan</p>
              <p className="text-lg font-bold">{data.invitedCount}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Savdo qilgan</p>
              <p className="text-lg font-bold">{data.rewardedCount}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Ishlangan</p>
              <p className="text-lg font-bold">{som(data.earnedSom)}</p>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card">
            <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
              <Users className="h-4 w-4" />
              Siz orqali kelganlar
            </h2>
            {data.invited.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Hali hech kim yo&apos;q. Havolani do&apos;stlaringizga yuboring.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.invited.map((person) => (
                  <li key={person.userId} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {person.displayName ?? 'Foydalanuvchi'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(person.joinedAt).toLocaleDateString('uz-UZ')}
                      </p>
                    </div>
                    {person.rewardedAt ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <Gift className="h-3.5 w-3.5" />
                        +{som(person.rewardSom)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Savdo kutilmoqda
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
