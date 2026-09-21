'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  ArrowUpRight,
  Eye,
  Loader2,
  Mail,
  Pencil,
  Store,
  Trash2,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { deleteAccount, unpublishAccount } from '@/lib/accounts-client';
import type { UserAccountResponse } from '@/lib/accounts-types';
import { listingMediaUrl } from '@/lib/marketplace-media';
import { cn } from '@/lib/utils';

/**
 * Bitta akkount kartochkasi.
 *
 * <p>Email YASHIRIN turadi va faqat bosilganda ochiladi: bu ekranni
 * yonidagi odam ham ko'radi, manzil esa akkountga kirish yo'lining yarmi.
 *
 * <p>Bozorda turgan akkount o'chirilmaydi — avval bozordan olinadi. Ikkita
 * amal bitta tugmaga yig'ilsa, e'lonni ham, akkountni ham bir bosishda
 * yo'qotish mumkin bo'lardi.
 */
export function AccountCard({
  account,
  onPublish,
}: {
  account: UserAccountResponse;
  onPublish?: (account: UserAccountResponse) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [emailShown, setEmailShown] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photo = account.mediaMessageIds[0] ? listingMediaUrl(account.mediaMessageIds[0]) : null;
  const title = account.title?.trim() || 'Nomsiz akkount';

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? 'Amal bajarilmadi');
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <AccountPhoto photo={photo} title={title} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-black text-foreground">{title}</h3>
            {account.onMarket && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Bozorda
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary(account.attributes)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {squadCount(account.attributes)} o&apos;yinchi
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs">
        <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {account.email ? (
          emailShown ? (
            <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{account.email}</span>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">•••••••••@•••</span>
              <button
                type="button"
                onClick={() => setEmailShown(true)}
                className="shrink-0 font-semibold text-primary hover:underline"
              >
                <Eye className="mr-1 inline h-3.5 w-3.5" />
                Ko&apos;rsatish
              </button>
            </>
          )
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">Email biriktirilmagan</span>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {confirming ? (
        <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs font-semibold text-destructive">
            Akkount o&apos;chirilsinmi? Ma&apos;lumotlari va o&apos;yinchilari ham ketadi.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Bekor qilish
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => deleteAccount(account.id))}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Ha, o&apos;chir
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button asChild type="button" size="sm" variant="outline" className="flex-1">
            <Link href={`/profile/accounts/${account.id}`}>
              <Pencil className="h-4 w-4" />
              Tahrirlash
            </Link>
          </Button>

          {account.onMarket ? (
            <>
              {account.currentListingId && (
                <Button asChild type="button" size="sm" variant="ghost">
                  <Link href={`/marketplace/${account.currentListingId}`}>
                    E&apos;lon
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => unpublishAccount(account.id))}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Bozordan olish
              </Button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" className="flex-1" onClick={() => onPublish?.(account)}>
                <Store className="h-4 w-4" />
                Bozorga chiqarish
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="O'chirish"
                title="O'chirish"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function AccountPhoto({ photo, title }: { photo: string | null; title: string }) {
  const [broken, setBroken] = useState(false);
  if (photo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        onError={() => setBroken(true)}
        className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-border"
      />
    );
  }
  return (
    <div className={cn(
      'grid h-14 w-14 shrink-0 place-items-center rounded-xl',
      'bg-gradient-to-br from-primary/20 to-primary/5 text-base font-black text-primary',
    )}>
      {title.trim()[0]?.toUpperCase() ?? '#'}
    </div>
  );
}

const PLATFORM_LABEL: Record<string, string> = {
  MOBILE: 'Mobile',
  STEAM: 'Steam',
  PLAYSTATION: 'PlayStation',
  XBOX: 'Xbox',
};

/** "Mobile · D3 · TS 3150" — bo'sh maydonlar tushib qoladi, tire qolmaydi. */
function summary(attributes: Record<string, unknown>): string {
  const parts: string[] = [];
  const platform = attributes.platform;
  if (typeof platform === 'string') {
    parts.push(PLATFORM_LABEL[platform] ?? platform);
  }
  const division = attributes.highest_division_level;
  if (typeof division === 'number') {
    parts.push(`D${division}`);
  }
  const strength = attributes.team_strength;
  if (typeof strength === 'number') {
    parts.push(`TS ${strength}`);
  }
  return parts.length > 0 ? parts.join(' · ') : "Ma'lumot to'ldirilmagan";
}

function squadCount(attributes: Record<string, unknown>): number {
  const squad = attributes.valuable_players;
  return Array.isArray(squad) ? squad.length : 0;
}
