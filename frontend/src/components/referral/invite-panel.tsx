'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Copy, Gift, Loader2, RefreshCw, Send, UserPlus, Users, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatCompactNumber } from '@/lib/marketplace-format';
import { trackGrowth } from '@/lib/growth-analytics';
import { inviteLinks } from '@/lib/referral-capture';
import { getMyReferrals, type MyReferrals } from '@/lib/referrals';

function som(value: number | null | undefined): string {
  return formatCompactNumber(value ?? 0);
}

const SHARE_MESSAGE = 'eFootball akkauntlarini EFBazaar’da toping, soting va xarid qiling. Shu havola orqali qo‘shiling!';

export function InvitePanel({ botUsername }: { botUsername: string }) {
  const [data, setData] = useState<MyReferrals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [origin, setOrigin] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  const fallbackInput = useRef<HTMLTextAreaElement>(null);
  const viewed = useRef(false);
  const mounted = useRef(false);
  const copying = useRef(false);

  useEffect(() => {
    mounted.current = true;
    setOrigin(window.location.origin);
    if (!viewed.current) {
      viewed.current = true;
      trackGrowth('invite_view', { placement: 'invite_page' });
    }
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    getMyReferrals()
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (copyState !== 'failed') return;
    fallbackInput.current?.focus();
    fallbackInput.current?.select();
  }, [copyState]);

  const links = data && origin ? inviteLinks(data.code, origin, botUsername) : null;
  const inviteUrl = links?.bot ?? links?.site;
  // Telegram opens a recipient picker and lets the sender edit this text.
  const shareUrl = inviteUrl
    ? `https://t.me/share/url?${new URLSearchParams({ url: inviteUrl, text: SHARE_MESSAGE })}`
    : null;
  const hasReward = data ? data.rewardSom > 0 : false;

  async function copy() {
    if (!inviteUrl || copying.current) return;
    copying.current = true;
    setCopyState('copying');
    trackGrowth('invite_share_intent', { placement: 'invite_page', method: 'copy' });
    try {
      await navigator.clipboard.writeText(inviteUrl);
      if (mounted.current) {
        setCopyState('copied');
        trackGrowth('invite_copy_success', { placement: 'invite_page', method: 'copy' });
      }
    } catch {
      if (mounted.current) setCopyState('failed');
    } finally {
      copying.current = false;
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 pb-4">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary dark:text-secondary">Do‘stlar bilan yaxshiroq</p>
        <h1 className="text-2xl font-bold tracking-tight">Do‘st taklif qilish</h1>
        <p className="mt-1 text-sm text-muted-foreground">EFBazaar’ni do‘stlaringiz bilan ulashing.</p>
      </header>

      {loading ? (
        <div role="status" className="flex min-h-48 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Taklif ma’lumotlari yuklanmoqda…
        </div>
      ) : error ? (
        <section role="alert" className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <div>
            <h2 className="font-semibold">Taklif ma’lumotlari yuklanmadi</h2>
            <p className="mt-1 text-sm text-muted-foreground">Aloqani tekshirib, yana urinib ko‘ring.</p>
          </div>
          <Button variant="outline" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            <RefreshCw aria-hidden /> Qayta urinish
          </Button>
        </section>
      ) : data ? (
        <>
          <section aria-labelledby="invite-reward" className="overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-sm">
            <div className="bg-primary/[0.06] p-5 sm:p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-secondary">
                {hasReward ? <Gift aria-hidden className="h-6 w-6" /> : <UserPlus aria-hidden className="h-6 w-6" />}
              </div>
              {hasReward ? (
                <>
                  <p className="text-sm font-medium text-muted-foreground">Har bir yangi do‘st uchun</p>
                  <h2 id="invite-reward" className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                    {som(data.rewardSom)} <span className="text-lg font-semibold text-primary dark:text-secondary">so‘m</span>
                  </h2>
                  <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                    Do‘stingiz havolangiz orqali ro‘yxatdan o‘tib, birinchi savdosini muvaffaqiyatli yakunlaganda hamyoningizga tushadi.
                  </p>
                </>
              ) : (
                <>
                  <h2 id="invite-reward" className="text-xl font-bold">Do‘stlaringizni EFBazaar’ga taklif qiling</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Hozir pul mukofoti belgilanmagan. Havolangiz orqali qo‘shilgan do‘stlaringizni shu yerda ko‘rasiz.</p>
                </>
              )}
            </div>
            <div className="space-y-2.5 p-4 sm:px-6 sm:py-5">
              {shareUrl && (
                <Button asChild size="lg" className="w-full rounded-xl">
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackGrowth('invite_share_intent', { placement: 'invite_page', method: 'telegram' })}>
                    <Send aria-hidden /> Telegramda yuborish
                  </a>
                </Button>
              )}
              <Button variant="outline" className="w-full rounded-xl" disabled={!inviteUrl || copyState === 'copying'} onClick={copy}>
                {copyState === 'copied' ? <Check aria-hidden /> : copyState === 'copying' ? <Loader2 aria-hidden className="animate-spin" /> : <Copy aria-hidden />}
                {copyState === 'copying' ? 'Nusxalanmoqda…' : 'Havolani nusxalash'}
              </Button>
              <p className="text-center text-xs leading-relaxed text-muted-foreground">Xabar matnini Telegramda o‘zgartirishingiz mumkin.</p>
              <p role="status" className="text-center text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {copyState === 'copied' ? 'Havola nusxalandi. Do‘stingizga yuborishingiz mumkin.' : ''}
              </p>
              {copyState === 'failed' && inviteUrl && (
                <div className="space-y-2 rounded-xl bg-muted/50 p-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">Avtomatik nusxalanmadi. Havolani belgilab, qo‘lda nusxalang.</p>
                  <label htmlFor="invite-link-fallback" className="block text-xs font-semibold">Taklif havolangiz</label>
                  <textarea
                    ref={fallbackInput}
                    id="invite-link-fallback"
                    readOnly
                    rows={2}
                    value={inviteUrl}
                    onFocus={(event) => event.currentTarget.select()}
                    className="w-full resize-none break-all rounded-lg border border-border bg-background p-2.5 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
            </div>
          </section>

          <section aria-labelledby="invite-steps" className="px-1">
            <h2 id="invite-steps" className="mb-3 text-sm font-semibold">Qanday ishlaydi?</h2>
            <ol className="space-y-3">
              {[
                ['Havolangizni yuboring', 'Telegramdan do‘stingizni tanlang yoki havolani nusxalang.'],
                ['Do‘stingiz qo‘shiladi', 'U havolangiz orqali yangi akkaunt ochadi.'],
                ['Birinchi savdo yakunlanadi', hasReward ? 'Savdo muvaffaqiyatli tugagach, mukofot hamyoningizga tushadi.' : 'Do‘stingiz EFBazaar’da savdo qilishni boshlaydi.'],
              ].map(([title, description], index) => (
                <li key={title} className="flex items-start gap-3">
                  <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary dark:text-secondary">{index + 1}</span>
                  <div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p></div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-label="Taklif natijalari" className="rounded-2xl border border-border bg-card">
            <dl className="grid grid-cols-3 divide-x divide-border px-1 py-4 sm:py-5">
              <div className="min-w-0 px-2 text-center sm:px-3"><dt className="text-[11px] leading-4 text-muted-foreground sm:text-xs">Qo‘shilgan do‘stlar</dt><dd className="mt-2 text-xl font-bold">{data.invitedCount}</dd></div>
              <div className="min-w-0 px-2 text-center sm:px-3"><dt className="text-[11px] leading-4 text-muted-foreground sm:text-xs">Mukofot tushgan</dt><dd className="mt-2 text-xl font-bold">{data.rewardedCount}</dd></div>
              <div className="min-w-0 px-2 text-center sm:px-3"><dt className="text-[11px] leading-4 text-muted-foreground sm:text-xs">Jami mukofot</dt><dd className="mt-2 break-words text-lg font-bold text-primary dark:text-secondary">{som(data.earnedSom)} <span className="text-xs font-medium">so‘m</span></dd></div>
            </dl>
            <Link href="/hamyon" className="flex min-h-11 items-center justify-between gap-2 border-t border-border px-4 text-sm font-medium transition hover:bg-muted/40">
              <span className="flex items-center gap-2"><Wallet aria-hidden className="h-4 w-4 text-muted-foreground" /> Hamyonni ko‘rish</span><ArrowRight aria-hidden className="h-4 w-4 text-muted-foreground" />
            </Link>
          </section>

          <section aria-labelledby="invited-friends" className="overflow-hidden rounded-2xl border border-border bg-card">
            <h2 id="invited-friends" className="flex items-center gap-2 border-b border-border px-4 py-3.5 text-sm font-semibold"><Users aria-hidden className="h-4 w-4 text-primary dark:text-secondary" /> Siz orqali qo‘shilganlar</h2>
            {data.invited.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-medium">Birinchi do‘stingizni taklif qiling</p>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Havolangiz orqali yangi akkaunt ochgan do‘stlaringiz shu yerda ko‘rinadi.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data.invited.map((person) => (
                  <li key={person.userId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{person.displayName || 'Foydalanuvchi'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{new Date(person.joinedAt).toLocaleDateString('uz-UZ')} · Qo‘shilgan</p>
                    </div>
                    {person.rewardedAt ? (
                      <div className="text-right"><p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{person.rewardSom != null ? `+${som(person.rewardSom)} so‘m` : 'Mukofot tushgan'}</p><p className="mt-1 text-[11px] text-muted-foreground">Mukofot tushgan</p></div>
                    ) : <span className="text-xs text-muted-foreground">Mukofot hali tushmagan</span>}
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
