'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Handshake, Heart, HelpCircle, LogOut, Mail, Moon, Package, ShieldCheck, Sun, UserCog, UserPlus, UserRound, Wallet } from 'lucide-react';

import { FEATURES } from '@/lib/feature-flags';

import { logoutAction } from '@/app/auth/actions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTheme } from '@/components/theme/use-theme';
import { isAdmin, isPartner } from '@/lib/admin';
import { isTradeAdmin } from '@/lib/trade-human';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

interface UserMenuProps {
  user: User;
  className?: string;
}

function initials(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?';
}

const ITEM_CLASS =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-foreground transition hover:bg-accent/60';

/**
 * Avatar button + dropdown. Replaces the name-plus-border button that used to
 * sit in the header: the display name cost ~130px of a row that also had to
 * hold search, and every entry behind it (theme, favourites, mail, admin) was
 * either a top-level button competing with the primary CTA or had no header
 * entry point at all.
 *
 * Deliberately hand-rolled on the same outside-pointerdown pattern as
 * {@link NotificationBell} rather than pulling in @radix-ui/react-dropdown-menu
 * for one menu.
 */
export function UserMenu({ user, className }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { isDark, mounted, toggle } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const admin = isAdmin(user);
  const partner = isPartner(user);
  const tradeAdmin = isTradeAdmin(user);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Profil menyusi"
        className="rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Avatar className="h-9 w-9 ring-1 ring-border transition hover:ring-primary/50">
          {user.telegramPhotoUrl && <AvatarImage src={user.telegramPhotoUrl} alt="" />}
          <AvatarFallback className="bg-accent text-[13px] font-black text-accent-foreground">
            {initials(user.displayName)}
          </AvatarFallback>
        </Avatar>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-56 origin-top-right animate-menu-in overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-card-hover"
        >
          <div className="border-b border-border px-2.5 pb-2.5 pt-1.5">
            <p className="truncate text-[13px] font-black text-foreground">{user.displayName}</p>
            {user.telegramUsername && (
              <p className="truncate text-[11px] text-muted-foreground">@{user.telegramUsername}</p>
            )}
          </div>

          <div className="pt-1.5">
            <Link href="/profile" role="menuitem" className={ITEM_CLASS} onClick={() => setOpen(false)}>
              <UserRound className="h-4 w-4 text-muted-foreground" />
              Profil
            </Link>
            <Link
              href="/profile?tab=listings"
              role="menuitem"
              className={ITEM_CLASS}
              onClick={() => setOpen(false)}
            >
              <Package className="h-4 w-4 text-muted-foreground" />
              E&apos;lonlarim
            </Link>
            <Link
              href="/profile?tab=favorites"
              role="menuitem"
              className={ITEM_CLASS}
              onClick={() => setOpen(false)}
            >
              <Heart className="h-4 w-4 text-muted-foreground" />
              Sevimli
            </Link>
            <Link href="/mail" role="menuitem" className={ITEM_CLASS} onClick={() => setOpen(false)}>
              <Mail className="h-4 w-4 text-muted-foreground" />
              Pochta
            </Link>
            {/*
              Also in the mobile bottom bar, deliberately. A wallet belongs with
              the account items conceptually, and the bar's five slots are
              contested: if Turnirlar ever comes back the bar entry is the one
              that goes, and this stays as the permanent route.
            */}
            {FEATURES.wallet && (
              <Link href="/hamyon" role="menuitem" className={ITEM_CLASS} onClick={() => setOpen(false)}>
                <Wallet className="h-4 w-4 text-muted-foreground" />
                Hamyon
              </Link>
            )}
            {/*
              Bitta yozuv, ikki manzil. Hamkor bo'lgan odamga "Hamkor
              bo'lish" ko'rsatish uni allaqachon o'tgan yo'lga qaytarardi;
              hamkor bo'lmaganga esa panel havolasi berib bo'lmaydi.

              Menyuda turishi shart: sahifa bor-u havola yo'q bo'lsa, unga
              faqat manzilni bilgan odam kira oladi.
            */}
            <Link
              href={partner ? '/partner' : '/partnership'}
              role="menuitem"
              className={ITEM_CLASS}
              onClick={() => setOpen(false)}
            >
              <Handshake className="h-4 w-4 text-muted-foreground" />
              {partner ? 'Hamkor admin paneli' : "Hamkor bo'lish"}
            </Link>
            <Link href="/invite" role="menuitem" className={ITEM_CLASS} onClick={() => setOpen(false)}>
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              Do&apos;st taklif qilish
            </Link>
            <Link href="/help" role="menuitem" className={ITEM_CLASS} onClick={() => setOpen(false)}>
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              Yordam va Qo‘llanma
            </Link>

            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={isDark}
              onClick={toggle}
              className={ITEM_CLASS}
              suppressHydrationWarning
            >
              {mounted && isDark ? (
                <Sun className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Moon className="h-4 w-4 text-muted-foreground" />
              )}
              Tungi rejim
              <span
                aria-hidden
                className={cn(
                  'ml-auto flex h-4 w-7 items-center rounded-full p-0.5 transition-colors',
                  mounted && isDark ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'h-3 w-3 rounded-full bg-background transition-transform duration-200 ease-[cubic-bezier(.32,.72,0,1)]',
                    mounted && isDark && 'translate-x-3',
                  )}
                />
              </span>
            </button>

            {admin && (
              <Link href="/admin" role="menuitem" className={ITEM_CLASS} onClick={() => setOpen(false)}>
                <ShieldCheck className="h-4 w-4 text-primary" />
                Admin panel
              </Link>
            )}
            {FEATURES.humanAdmin && tradeAdmin && (
              <Link href="/trade-admin" role="menuitem" className={ITEM_CLASS} onClick={() => setOpen(false)}>
                <UserCog className="h-4 w-4 text-primary" />
                Inson admin
              </Link>
            )}

            <div className="my-1 h-px bg-border" />

            <form action={logoutAction}>
              <button
                type="submit"
                role="menuitem"
                className={cn(ITEM_CLASS, 'text-destructive hover:bg-destructive/10')}
              >
                <LogOut className="h-4 w-4" />
                Chiqish
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
