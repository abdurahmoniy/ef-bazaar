'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useId, useRef, useState, useTransition, type ReactNode, type RefObject } from 'react';
import { ArrowUpRight, Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Loader2, Mail, MoreHorizontal, Pencil, Pin, PinOff, Sparkles, Store, Trash2, Users, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useSheetDrag } from '@/hooks/use-sheet-drag';
import { deleteAccount, unpublishAccount } from '@/lib/accounts-client';
import type { UserAccountResponse, AccountDisplayData } from '@/lib/accounts-types';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { listingMediaUrl } from '@/lib/marketplace-media';
import { accountDetailsIncomplete } from '@/lib/account-completeness';
import { emailBadges } from '@/lib/account-email-badges';
import { VerifiedEmailMark } from '@/components/profile/verified-email-mark';
import { cn } from '@/lib/utils';

export function AccountCard({ account, onPublish, display, pinned = false, onTogglePin }: {
  account: UserAccountResponse;
  onPublish?: (account: UserAccountResponse) => void;
  display?: AccountDisplayData;
  pinned?: boolean;
  onTogglePin?: () => void;
}) {
  const router = useRouter();
  const desktop = useMediaQuery('(min-width: 768px)');
  const publishAfterClose = useRef(false);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [actionsShown, setActionsShown] = useState(false);
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
  const controlsId = useId();
  const title = account.title?.trim() || 'Nomsiz akkount';
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

  function changeExpanded(next: boolean) {
    if (pending) return;
    setExpanded(next);
    setActionsShown(false);
    setEmailShown(false);
    setCopied(false);
    setMenuOpen(false);
    setConfirming(null);
    setError(null);
    setNotice('');
  }

  if (archived) return <SoldAccountCard account={account} desktop={desktop} />;
  const badges = emailBadges(account, display);

  const actionMenu = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-6 text-foreground">{summary(account.attributes)}</p>
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
  );

  return (
    <AccountDetails account={account} desktop={desktop} pinned={pinned} expanded={expanded} pending={pending}
      onOpenChange={changeExpanded} escapeCloses={!menuOpen && !confirming}
      onCloseAutoFocus={(event) => {
        // Open the next form after the popup releases its focus trap.
        if (publishAfterClose.current) {
          event.preventDefault();
          publishAfterClose.current = false;
          onPublish?.(account);
        }
      }}>
      <div className={cn("space-y-3", desktop ? "p-4" : "px-5 pb-2 pt-3")}>
        {desktop && actionMenu}

        {!desktop && <AccountFacts account={account} />}
        {account.onMarket && display?.price != null && <p className={cn("flex flex-wrap items-center justify-between gap-2 text-sm", !desktop && "border-t border-border/60 py-4")}>
          <span className="text-muted-foreground">Narx</span>
          <span className="font-bold tabular-nums">{formatPriceUZS(display.price)}</span>
        </p>}

        {!desktop && <Button type="button" variant="ghost" className="min-h-11 w-full justify-between rounded-xl text-muted-foreground" disabled={pending}
          aria-expanded={actionsShown} aria-controls={controlsId}
          onClick={() => { setActionsShown(!actionsShown); setMenuOpen(false); setConfirming(null); setEmailShown(false); setCopied(false); setError(null); setNotice(''); }}>
          Email va amallar<ChevronDown aria-hidden className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', actionsShown && 'rotate-180')} />
        </Button>}
        {(desktop || actionsShown) && <div id={controlsId} className="space-y-3">
          {!desktop && actionMenu}
          <div className="flex min-h-11 items-center gap-2 border-t border-border/60 pt-1">
            <Mail aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 break-all text-xs leading-5 text-muted-foreground select-text">
              {account.email ? emailShown ? account.email : '•••••••••@•••' : 'Email biriktirilmagan'}
            </span>
            {badges.verified && <VerifiedEmailMark />}
            {account.email && <div className="flex shrink-0 items-center">
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground"
                aria-label={emailShown ? 'Emailni yashirish' : 'Emailni ko‘rsatish'} aria-pressed={emailShown} onClick={() => setEmailShown(!emailShown)}>
                {emailShown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground" aria-label="Emailni nusxalash" onClick={copyEmail}>
                {copied ? <Check aria-hidden className="text-success" /> : <Copy aria-hidden />}
              </Button>
              <span role="status" className="sr-only">{copied ? 'Nusxalandi' : 'Nusxalash'}</span>
            </div>}
          </div>

          {badges.offerHref && (
            <Link href={badges.offerHref} className="-mt-1 flex min-h-11 items-center gap-2 rounded-lg bg-muted px-3 text-xs font-bold text-primary transition hover:bg-muted/70 dark:text-foreground">
              <Sparkles aria-hidden className="h-4 w-4 text-gold-foreground" />
              O‘zingiz tanlagan email biriktiring
            </Link>
          )}
          {badges.verifyHref && (
            <Link href={badges.verifyHref} className="-mt-1 inline-flex min-h-11 items-center gap-2 self-start rounded-lg border border-border px-3 text-xs font-bold text-primary transition hover:bg-muted dark:text-foreground">
              Tasdiqlash
            </Link>
          )}

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
              ) : (accountDetailsIncomplete(account) ? (
                <Button asChild variant="ghost" className="min-h-11 flex-1 bg-muted px-2 text-xs hover:bg-muted/80"><Link href={`/profile/accounts/${encodeURIComponent(account.id)}`}><Pencil aria-hidden className="h-4 w-4" />Ma’lumotlarni to‘ldirish</Link></Button>
              ) : (
                <Button type="button" variant="ghost" className="min-h-11 flex-1 bg-muted px-2 text-xs hover:bg-muted/80" onClick={() => {
                  publishAfterClose.current = true;
                  changeExpanded(false);
                }}>
                  <Store aria-hidden className="h-4 w-4" />Bozorga chiqarish
                </Button>
              ))}
            </div>
          )}
        </div>}
      </div>
    </AccountDetails>
  );
}

/**
 * Sotilgan yoki obmen qilingan akkount — "Akkountlarim" tarixi.
 *
 * <p>Faqat o'qish uchun: menyu, tahrir, email va bozorga chiqarish yo'q.
 * Ma'lumot endi xaridorniki, egasida esa eski holati xotira sifatida qoladi.
 */
function SoldAccountCard({ account, desktop }: { account: UserAccountResponse; desktop: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const swapped = account.archivedReason === 'SWAPPED_ON_PLATFORM';
  const date = soldDate(account.archivedAt);
  return (
    <AccountDetails account={account} desktop={desktop} expanded={expanded} onOpenChange={setExpanded}>
      <div className={cn("space-y-3", desktop ? "p-4" : "px-5 pb-2 pt-3")}>
        <div>
          {desktop && <p className="text-sm font-semibold leading-6 text-foreground">{summary(account.attributes)}</p>}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users aria-hidden className="h-3.5 w-3.5" />{squadCount(account.attributes)} o&apos;yinchi</p>
        </div>
        {!desktop && <AccountFacts account={account} />}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          {date && <span className="tabular-nums">{date}</span>}
          {!swapped && account.soldPrice != null && (
            <span className="font-bold tabular-nums">{formatPriceUZS(account.soldPrice)}</span>
          )}
        </div>
      </div>
    </AccountDetails>
  );
}

function AccountDetails({ account, desktop, expanded, onOpenChange, children, pinned = false, pending = false, escapeCloses = true, onCloseAutoFocus }: {
  account: UserAccountResponse;
  expanded: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  desktop: boolean;
  onCloseAutoFocus?: (event: Event) => void;
  pinned?: boolean;
  pending?: boolean;
  escapeCloses?: boolean;
}) {
  const sheetDrag = useSheetDrag({ enabled: !desktop, disabled: pending, onDismiss: () => onOpenChange(false) });
  const previousDesktop = useRef(desktop);
  const previewRef = useRef<HTMLButtonElement>(null);
  const detailsId = useId();
  const title = account.title?.trim() || 'Nomsiz akkount';
  const archived = account.status === 'ARCHIVED';
  const photo = account.mediaMessageIds[0] ? listingMediaUrl(account.mediaMessageIds[0]) : null;

  useEffect(() => {
    if (previousDesktop.current !== desktop && expanded && !pending) {
      onOpenChange(false);
      previewRef.current?.focus();
    }
    previousDesktop.current = desktop;
  }, [desktop, expanded, pending, onOpenChange]);

  return (
    <Dialog.Root open={expanded} onOpenChange={(open) => { if (!pending) onOpenChange(open); }}>
      <article data-state={archived ? 'sold' : undefined}
        className={cn('min-w-0 rounded-2xl border bg-card transition-colors', archived ? 'border-border/70' : emailBadges(account).custom ? 'gold-ring border-2' : expanded ? 'border-primary/40' : 'border-border/70')}>
        <AccountPreview account={account} pinned={pinned} expanded={expanded} panelId={detailsId} disabled={pending}
          desktop={desktop} previewRef={previewRef} />
        <Dialog.Portal>
          <Dialog.Overlay style={desktop ? undefined : { animationDuration: expanded ? '320ms' : '240ms', animationTimingFunction: 'ease-in-out' }} className={cn('fixed inset-0 z-50', desktop ? 'bg-foreground/45'
            : 'bg-black/50 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:fade-out-0')} />
          <Dialog.Content ref={sheetDrag.contentRef} id={detailsId} aria-modal="true" aria-describedby={undefined}
            style={desktop ? undefined : { ...sheetDrag.style, animationDuration: expanded ? '320ms' : '240ms', animationTimingFunction: expanded ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0, 0, 0.2, 1)' }}
            className={cn('fixed z-50 border border-border bg-card text-card-foreground shadow-xl outline-none',
              desktop ? 'left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl'
                : 'inset-x-0 bottom-0 flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-t-3xl motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:slide-in-from-bottom-[100%] motion-safe:data-[state=closed]:slide-out-to-bottom-[100%] transition-transform duration-300 ease-out motion-reduce:transition-none')}
            onCloseAutoFocus={(event) => { sheetDrag.reset(); onCloseAutoFocus?.(event); }}
            onEscapeKeyDown={(event) => { if (pending || !escapeCloses) event.preventDefault(); }}
            onInteractOutside={(event) => { if (pending) event.preventDefault(); }}>
            <div {...sheetDrag.handleProps} data-sheet-drag-handle={desktop ? undefined : ''} className={desktop ? undefined : 'shrink-0 touch-none select-none'}>
              {!desktop && <div className="relative aspect-video max-h-[min(14rem,28dvh)] w-full overflow-hidden bg-muted">
                <AccountPhoto key={photo} photo={photo} title={title} />
                <div aria-hidden className="absolute left-1/2 top-3 h-1 w-9 -translate-x-1/2 rounded-full bg-card/80 shadow-sm" />
              </div>}
              <div className={cn('flex shrink-0 items-center gap-3 border-b border-border/60', desktop ? 'px-4 py-3' : 'mx-5 py-4')}>
                <Dialog.Title asChild><h3 className={cn('min-w-0 flex-1 break-words font-semibold', desktop ? 'text-base' : 'text-xl')}>{title}</h3></Dialog.Title>
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost" size="icon" className={cn('h-11 w-11 shrink-0', desktop ? '-my-2 -mr-2' : 'rounded-full bg-muted')} aria-label="Tafsilotlarni yopish" disabled={pending}>
                    <X aria-hidden className="h-4 w-4" />
                  </Button>
                </Dialog.Close>
              </div>
            </div>
            {desktop ? children : <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>}
            {!desktop && <div className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
              <Dialog.Close asChild><Button type="button" className="min-h-12 w-full rounded-xl" disabled={pending}>Tayyor</Button></Dialog.Close>
            </div>}
          </Dialog.Content>
        </Dialog.Portal>
      </article>
    </Dialog.Root>
  );
}

function AccountPreview({ account, expanded, panelId, desktop, previewRef, pinned = false, disabled = false }: {
  account: UserAccountResponse;
  expanded: boolean;
  panelId: string;
  desktop: boolean;
  previewRef: RefObject<HTMLButtonElement | null>;
  pinned?: boolean;
  disabled?: boolean;
}) {
  const title = account.title?.trim() || 'Nomsiz akkount';
  const photo = account.mediaMessageIds[0] ? listingMediaUrl(account.mediaMessageIds[0]) : null;
  const archived = account.status === 'ARCHIVED';
  const status = archived ? account.archivedReason === 'SWAPPED_ON_PLATFORM' ? 'Almashtirilgan' : 'Sotilgan'
    : account.onMarket ? 'Bozorda' : 'Bozorda emas';
  const Indicator = desktop ? ArrowUpRight : ChevronDown;

  if (!desktop) {
    return (
      <h2>
        <Dialog.Trigger asChild><button ref={previewRef} type="button" aria-label={`${title}: ${status}${pinned ? ', mahkamlangan' : ''}. Tafsilotlar`} aria-expanded={expanded} aria-controls={panelId}
          disabled={disabled}
          className="group flex min-h-[94px] w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait">
          <span className="block h-[76px] w-24 shrink-0 overflow-hidden rounded-lg bg-muted min-[360px]:w-[108px]">
            <AccountPhoto key={photo} photo={photo} title={title} compact unavailable={archived} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn('truncate text-sm font-semibold leading-6', archived ? 'text-muted-foreground' : 'text-foreground')}>{title}</span>
              {pinned && <Pin aria-label="Mahkamlangan" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </span>
            <span className={cn('flex items-center gap-1.5 text-xs font-normal',
              !archived && account.onMarket ? 'text-success' : 'text-muted-foreground')}>
              {!archived && account.onMarket && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />}
              {status}
            </span>
          </span>
          <ChevronRight aria-hidden className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </button></Dialog.Trigger>
      </h2>
    );
  }

  const preview = (
    <button ref={previewRef} type="button" aria-label={`${title}: ${status}${pinned ? ', mahkamlangan' : ''}. Tafsilotlar`} aria-expanded={expanded} aria-controls={panelId}
      disabled={disabled}
      className="group block w-full rounded-2xl text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait">
      <span className="relative block aspect-[4/3] overflow-hidden rounded-t-2xl bg-muted">
        <AccountPhoto key={photo} photo={photo} title={title} unavailable={archived} />
        {!archived && <span className={cn('absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/95 px-2.5 py-1 text-xs font-semibold shadow-sm',
          account.onMarket ? 'text-success' : 'text-muted-foreground')}>
          {account.onMarket && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />}
          {status}
        </span>}
        {pinned && <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full border border-border/60 bg-card/95 text-foreground shadow-sm"><Pin aria-label="Mahkamlangan" className="h-3.5 w-3.5" /></span>}
      </span>
      <span className="flex min-h-16 items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-semibold leading-6', archived ? 'text-muted-foreground' : 'text-foreground')}>{title}</span>
          <span className="block text-xs font-normal text-muted-foreground">{archived ? status : expanded ? 'Tafsilotlarni yopish' : 'Tafsilotlarni ko‘rish'}</span>
        </span>
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors', expanded ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground group-hover:text-foreground')}>
          <Indicator aria-hidden className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', !desktop && expanded && 'rotate-180')} />
        </span>
      </span>
    </button>
  );
  return <h2>{desktop ? <Dialog.Trigger asChild>{preview}</Dialog.Trigger> : preview}</h2>;
}

function AccountFacts({ account }: { account: UserAccountResponse }) {
  const { platform, team_strength: strength } = account.attributes;
  const facts: [string, string][] = [];
  if (typeof platform === 'string') facts.push(['Platforma', PLATFORM_LABEL[platform] ?? platform]);
  if (typeof strength === 'number') facts.push(['Jamoa kuchi', `TS ${strength}`]);
  const status = account.status === 'ARCHIVED' ? account.archivedReason === 'SWAPPED_ON_PLATFORM' ? 'Almashtirilgan' : 'Sotilgan'
    : account.onMarket ? 'Bozorda' : 'Bozorda emas';
  facts.push(['Holat', status]);
  return <>
    {facts.length === 1 && <p className="text-sm text-muted-foreground">Ma&apos;lumot to&apos;ldirilmagan</p>}
    <dl className="divide-y divide-border/60 text-sm">
      {facts.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 py-4">
        <dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words text-right font-medium">{value}</dd>
      </div>)}
    </dl>
  </>;
}

/** `06.10.2026` — Toshkent vaqti bilan, qurilma sozlamasidan qat'i nazar. */
function soldDate(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')}.${part('month')}.${part('year')}`;
}

function AccountPhoto({ photo, title, compact = false, unavailable = false }: { photo: string | null; title: string; compact?: boolean; unavailable?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (photo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        onError={() => setBroken(true)}
        loading="lazy"
        decoding="async"
        className={cn('h-full w-full object-cover', unavailable && 'grayscale opacity-80')}
      />
    );
  }
  return (
    <span aria-hidden className={cn(
      'flex h-full w-full flex-col items-center justify-center gap-2',
      'bg-gradient-to-br from-primary/15 to-primary/5 text-foreground',
      unavailable && 'grayscale opacity-80',
    )}>
      <span className={cn('font-black opacity-30', compact ? 'text-2xl' : 'text-4xl')}>{title.trim()[0]?.toUpperCase() ?? '#'}</span>
      {!compact && <span className="text-xs font-medium text-muted-foreground">Rasm qo‘shilmagan</span>}
    </span>
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
