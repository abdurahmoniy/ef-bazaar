'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { ArrowUpRight, Check, Copy, Eye, EyeOff, Loader2, Mail, MoreHorizontal, Pencil, Pin, PinOff, Store, Trash2, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { deleteAccount, unpublishAccount } from '@/lib/accounts-client';
import type { UserAccountResponse, AccountDisplayData } from '@/lib/accounts-types';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { listingMediaUrl } from '@/lib/marketplace-media';
import { accountDetailsIncomplete } from '@/lib/account-completeness';
import { cn } from '@/lib/utils';

export function AccountCard({ account, onPublish, display, pinned = false, onTogglePin }: {
  account: UserAccountResponse;
  onPublish?: (account: UserAccountResponse) => void;
  display?: AccountDisplayData;
  pinned?: boolean;
  onTogglePin?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [emailShown, setEmailShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState<'delete' | 'unpublish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const actionId = useId();
  const confirmationId = useId();
  const title = account.title?.trim() || 'Nomsiz akkount';
  const photo = account.mediaMessageIds[0] ? listingMediaUrl(account.mediaMessageIds[0]) : null;
  const archived = account.status === 'ARCHIVED';

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (!pending && !confirming && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      menuButtonRef.current?.focus();
    }
  }, [pending, confirming]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [menuOpen]);

  function cancelConfirmation() {
    setConfirming(null);
    setError(null);
    menuButtonRef.current?.focus();
  }

  function runConfirmed() {
    setError(null);
    startTransition(async () => {
      try {
        const result = confirming === 'unpublish'
          ? await unpublishAccount(account.id)
          : await deleteAccount(account.id);
        if (!result.ok) {
          setError(result.message ?? 'Amal bajarilmadi. Qayta urinib ko‘ring.');
          return;
        }
        setNotice(confirming === 'unpublish' ? 'Akkount bozordan olindi.' : 'Akkount o‘chirildi.');
        restoreFocusRef.current = true;
        setConfirming(null);
        router.refresh();
      } catch {
        setError('Amal bajarilmadi. Qayta urinib ko‘ring.');
      }
    });
  }

  async function copyEmail() {
    if (!account.email) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(account.email);
      setCopied(true);
    } catch {
      setCopied(false);
      setError('Nusxalab bo‘lmadi. Emailni ochib, qo‘lda nusxalang.');
    }
  }

  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <AccountPhoto photo={photo} title={title} />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold leading-5 text-foreground">
            <span className="truncate">{title}</span>
            {pinned && <Pin aria-label="Mahkamlangan" className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{summary(account.attributes)}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users aria-hidden className="h-3.5 w-3.5" />{squadCount(account.attributes)} o&apos;yinchi
          </p>
        </div>
        <div ref={menuRef} className="relative -mr-2 -mt-2 shrink-0">
          <Button ref={menuButtonRef} type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="Akkount amallari"
            aria-expanded={menuOpen} aria-controls={actionId} disabled={pending}
            onClick={() => setMenuOpen(!menuOpen)}>
            <MoreHorizontal aria-hidden className="h-5 w-5" />
          </Button>
          {menuOpen && (
            <div id={actionId} role="group" aria-label={`${title}: amallar`}
              className="absolute right-0 top-11 z-20 w-52 rounded-xl border border-border bg-card p-1 shadow-lg"
              onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setMenuOpen(false); }}>
              <Link href={`/profile/accounts/${account.id}`} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Pencil aria-hidden className="h-4 w-4" />Tahrirlash
              </Link>
              {onTogglePin && (
                <button type="button" onClick={() => { onTogglePin(); setMenuOpen(false); menuButtonRef.current?.focus(); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {pinned ? <PinOff aria-hidden className="h-4 w-4" /> : <Pin aria-hidden className="h-4 w-4" />}
                  {pinned ? 'Mahkamlashni bekor qilish' : 'Yuqoriga mahkamlash'}
                </button>
              )}
              <button type="button" onClick={() => { setConfirming(account.onMarket ? 'unpublish' : 'delete'); setMenuOpen(false); setError(null); }}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {account.onMarket ? <Store aria-hidden className="h-4 w-4" /> : <Trash2 aria-hidden className="h-4 w-4" />}
                {account.onMarket ? 'Bozordan olish' : "O'chirish"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
          account.onMarket ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
          {account.onMarket && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
          {account.onMarket ? 'Bozorda' : archived ? 'Arxivda' : 'Bozorda emas'}
        </span>
        {account.onMarket && display?.price != null && <span className="text-sm font-bold tabular-nums">{formatPriceUZS(display.price)}</span>}
      </div>

      <div className="flex min-h-11 items-center gap-2 border-t border-border/60 pt-1">
        <Mail aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 break-all text-xs leading-5 text-muted-foreground select-text">
          {account.email ? emailShown ? account.email : '•••••••••@•••' : 'Email biriktirilmagan'}
        </span>
        {account.email && <div className="flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground"
            aria-label={emailShown ? 'Emailni yashirish' : 'Emailni ko‘rsatish'} aria-pressed={emailShown} onClick={() => setEmailShown(!emailShown)}>
            {emailShown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground" aria-label="Emailni nusxalash" onClick={copyEmail}>
            {copied ? <Check aria-hidden className="text-emerald-600 dark:text-emerald-300" /> : <Copy aria-hidden />}
          </Button>
          <span role="status" className="sr-only">{copied ? 'Nusxalandi' : 'Nusxalash'}</span>
        </div>}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}

      {confirming ? (
        <div role="alertdialog" aria-labelledby={confirmationId} className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3"
          onKeyDown={(event) => { if (event.key === 'Escape' && !pending) cancelConfirmation(); }}>
          <p id={confirmationId} className="text-sm font-semibold">
            {confirming === 'unpublish' ? 'Akkount bozordan olinsinmi? Akkount va email saqlanadi.' : "Akkount o'chirilsinmi? Ma'lumotlari va o'yinchilari ham ketadi."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button ref={cancelRef} type="button" variant="outline" className="min-h-11 flex-1" disabled={pending} onClick={cancelConfirmation}>Bekor qilish</Button>
            <Button type="button" variant="destructive" className="min-h-11 flex-1" disabled={pending} onClick={runConfirmed}>
              {pending && <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              {confirming === 'unpublish' ? 'Ha, bozordan olish' : "Ha, o'chir"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-auto flex flex-wrap gap-2">
          {display?.mailboxHref && (
            <Button asChild variant="ghost" className="min-h-11 flex-1 px-2 text-xs"><a href={display.mailboxHref}><Mail aria-hidden className="h-4 w-4" />Pochtani ochish<ArrowUpRight aria-hidden className="h-4 w-4" /></a></Button>
          )}
          {account.onMarket ? account.currentListingId && (
            <Button asChild variant="ghost" className="min-h-11 flex-1 bg-muted px-2 text-xs hover:bg-muted/80">
              <Link href={`/marketplace/${account.currentListingId}`}>E&apos;lonni ko&apos;rish<ArrowUpRight aria-hidden className="h-4 w-4" /></Link>
            </Button>
          ) : !archived && (accountDetailsIncomplete(account) ? (
            <Button asChild variant="ghost" className="min-h-11 flex-1 bg-muted px-2 text-xs hover:bg-muted/80"><Link href={`/profile/accounts/${encodeURIComponent(account.id)}`}><Pencil aria-hidden className="h-4 w-4" />Ma’lumotlarni to‘ldirish</Link></Button>
          ) : (
            <Button type="button" variant="ghost" className="min-h-11 flex-1 bg-muted px-2 text-xs hover:bg-muted/80" onClick={() => onPublish?.(account)}>
              <Store aria-hidden className="h-4 w-4" />Bozorga chiqarish
            </Button>
          ))}
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
