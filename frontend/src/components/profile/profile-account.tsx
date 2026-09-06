'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  Bell,
  Check,
  ChevronRight,
  Copy,
  CreditCard,
  Fingerprint,
  Handshake,
  Heart,
  LogOut,
  Mail,
  Moon,
  Package,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Star,
  Sun,
  Trash2,
  UserCog,
  Wallet,
} from 'lucide-react';

import { DeleteAccountButton } from '@/components/profile/delete-account-button';
import { GoogleLinkButton } from '@/components/profile/google-link-button';
import { LinkTelegramButton } from '@/components/profile/link-telegram-button';
import { TipCallout } from '@/components/help/tip-callout';
import { TradeAdminApplicationPanel } from '@/components/profile/trade-admin-application-panel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme } from '@/components/theme/use-theme';
import { fetchUnreadCount } from '@/lib/notifications-client';
import { FEATURES } from '@/lib/feature-flags';
import { isAdmin, isPartner } from '@/lib/admin';
import { InvitationCard } from '@/components/growth/invitation-card';
import { ChannelOwnerCard } from '@/components/growth/channel-owner-card';
import { isTradeAdmin } from '@/lib/trade-human';
import { cn } from '@/lib/utils';
import type { TradeAdminApplicationResponse } from '@/lib/trade-admin-applications';
import type { SellerRatingSummaryResponse } from '@/lib/trade-types';
import type { User } from '@/lib/types';
import { logoutAction } from '@/app/auth/actions';

interface ProfileAccountProps {
  user: User;
  googleClientId: string;
  botUsername: string;
  tradeAdminApplication: TradeAdminApplicationResponse | null;
  listingsCount?: number;
  favoritesCount?: number;
  ratingSummary?: SellerRatingSummaryResponse | null;
}

export function ProfileAccount({
  user,
  googleClientId,
  botUsername,
  tradeAdminApplication,
  listingsCount = 0,
  favoritesCount = 0,
  ratingSummary,
}: ProfileAccountProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const { isDark, mounted, toggle } = useTheme();

  const defaultContact = user.telegramUsername ? `@${user.telegramUsername}` : user.email ?? '';

  const initials = (user.displayName || 'U')
    .split(' ')
    .map((chunk) => chunk[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const date = new Date(user.createdAt);
  const months = [
    'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'
  ];
  const joinedDate = `${date.getDate()}-${months[date.getMonth()]} ${date.getFullYear()}-yil`;

  useEffect(() => {
    fetchUnreadCount().then((count) => {
      if (count !== null) setUnreadNotifications(count);
    });
  }, []);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const admin = isAdmin(user);
  const tradeAdmin = isTradeAdmin(user);

  const navMenuItems = [
    {
      id: 'listings',
      label: "E'lonlarim",
      description: "Sotuvdagi akkauntlar va takliflar",
      href: '/profile?tab=listings',
      icon: <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
      bg: 'bg-blue-500/10 dark:bg-blue-400/10',
      badge: listingsCount > 0 ? `${listingsCount}` : undefined,
    },
    {
      id: 'trades',
      label: 'Savdolarim',
      description: 'Xavfsiz bitimlar va xaridlar tarixi',
      href: '/profile?tab=trades',
      icon: <Handshake className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
      bg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    },
    {
      id: 'favorites',
      label: 'Sevimli e\'lonlar',
      description: 'Saqlab qo\'yilgan sevimli akkauntlar',
      href: '/profile?tab=favorites',
      icon: <Heart className="h-5 w-5 text-rose-600 dark:text-rose-400" />,
      bg: 'bg-rose-500/10 dark:bg-rose-400/10',
      badge: favoritesCount > 0 ? `${favoritesCount}` : undefined,
    },
    {
      id: 'notifications',
      label: 'Bildirishnomalar',
      description: 'Xabarlar va tizim yangiliklari',
      href: '/notifications',
      icon: <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
      bg: 'bg-amber-500/10 dark:bg-amber-400/10',
      badge: unreadNotifications > 0 ? (unreadNotifications > 99 ? '99+' : `${unreadNotifications}`) : undefined,
      mobileOnly: true,
    },
    {
      id: 'mail',
      label: 'Pochta',
      description: 'Xabarlar va bildirishnomalar',
      href: '/mail',
      icon: <Mail className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />,
      bg: 'bg-indigo-500/10 dark:bg-indigo-400/10',
    },
    ...(FEATURES.wallet
      ? [
          {
            id: 'wallet',
            label: 'Hamyon',
            description: 'Balans, depozit va pul yechish',
            href: '/hamyon',
            icon: <Wallet className="h-5 w-5 text-violet-600 dark:text-violet-400" />,
            bg: 'bg-violet-500/10 dark:bg-violet-400/10',
          },
        ]
      : []),
    {
      id: 'kartalar',
      label: 'To\'lov kartalarim',
      description: 'Hisob-kitob uchun bank kartalari',
      href: '/profile?tab=kartalar',
      icon: <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
      bg: 'bg-amber-500/10 dark:bg-amber-400/10',
    },
    ...(admin
      ? [
          {
            id: 'admin',
            label: 'Admin panel',
            description: 'Boshqaruv, statistika va arizalar',
            href: '/admin',
            icon: <ShieldCheck className="h-5 w-5 text-primary" />,
            bg: 'bg-primary/10',
          },
        ]
      : []),
    ...(FEATURES.humanAdmin && tradeAdmin
      ? [
          {
            id: 'trade-admin',
            label: 'Inson admin',
            description: 'Bitimlar va moderatsiya paneli',
            href: '/trade-admin',
            icon: <UserCog className="h-5 w-5 text-primary" />,
            bg: 'bg-primary/10',
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* 1. Flush Profile Header on Mobile */}
      <div className="-mx-4 -mt-4 border-b border-border/60 bg-card px-4 pt-5 pb-4 sm:mx-0 sm:mt-0 sm:rounded-2xl sm:border sm:p-5 sm:shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="relative shrink-0">
              <Avatar className="h-14 w-14 sm:h-16 sm:w-16 ring-2 ring-border/80 shadow-xs">
                {user.telegramPhotoUrl && (
                  <AvatarImage src={user.telegramPhotoUrl} alt={user.displayName} />
                )}
                <AvatarFallback className="text-xl sm:text-2xl font-black bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {user.verified && (
                <span
                  title="Tasdiqlangan profil"
                  className="absolute -bottom-0.5 -right-0.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-card"
                >
                  <BadgeCheck className="h-3 w-3" />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-foreground truncate">
                  {user.displayName}
                </h1>
                {user.verified && (
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                    <BadgeCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    Tasdiqlangan
                  </span>
                )}
              </div>

              {user.telegramUsername && (
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
                  @{user.telegramUsername}
                </p>
              )}

              {ratingSummary && ratingSummary.ratingCount > 0 && (
                <Link
                  href={`/users/${user.id}`}
                  className="inline-flex items-center gap-1.5 pt-0.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline"
                >
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span>{ratingSummary.averageRating.toFixed(1)}</span>
                  <span className="font-normal text-muted-foreground">({ratingSummary.ratingCount} ta baho)</span>
                </Link>
              )}
            </div>
          </div>

          <div className="shrink-0">
            <Link
              href="/profile/edit"
              aria-label="Profil sozlamalari"
              className="grid h-9 w-9 place-items-center rounded-full border border-border/80 bg-muted/40 text-muted-foreground transition hover:border-primary/40 hover:text-foreground active:scale-95 shadow-2xs"
            >
              <Settings className="h-4.5 w-4.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Grouped Navigation Menu (List Hub) */}
      <InvitationCard placement="profile" compact />
      <ChannelOwnerCard placement="profile" partner={isPartner(user)} />
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm divide-y divide-border/60">
        {navMenuItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              "flex items-center justify-between p-4 transition-colors hover:bg-muted/40 active:bg-muted/70 tap-press",
              item.mobileOnly && "md:hidden"
            )}
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', item.bg)}>
                {item.icon}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{item.label}</p>
                <p className="text-xs text-muted-foreground truncate">{item.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              {item.badge && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {item.badge}
                </span>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </div>
          </Link>
        ))}

        {/* Tungi rejim Toggle Item */}
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/40 active:bg-muted/70 tap-press text-left"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-500/10 text-slate-700 dark:text-slate-300">
              {mounted && isDark ? (
                <Sun className="h-5 w-5 text-amber-500" />
              ) : (
                <Moon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">Tungi rejim</p>
              <p className="text-xs text-muted-foreground truncate">
                {mounted && isDark ? "Qorong'i mavzu yoqilgan" : "Yorug' mavzu yoqilgan"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span
              aria-hidden
              className={cn(
                'flex h-6 w-11 items-center rounded-full p-0.5 transition-colors',
                mounted && isDark ? 'bg-primary' : 'bg-muted-foreground/30',
              )}
            >
              <span
                className={cn(
                  'h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-200 ease-[cubic-bezier(.32,.72,0,1)]',
                  mounted && isDark && 'translate-x-5',
                )}
              />
            </span>
          </div>
        </button>
      </div>

      {/* 3. Account Verification Card */}
      <Card className="rounded-2xl border-border/80 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Akkount tasdiqlash
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Xavfsizlik va ishonch belgisini olish uchun Google hamda Telegram hisoblaringizni ulang.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <TipCallout
            variant="tip"
            learnMoreHref="/help#why-link-telegram-google"
            learnMoreLabel="Nega bu muhim?"
          >
            <strong>Xaridorlar ishonchini oshiring:</strong> Telegram va Google hisoblaringizni ulab, profilingizga rasmiy <span className="font-bold text-emerald-600 dark:text-emerald-400">Tasdiqlangan</span> belgisini oling. Xaridorlar tasdiqlangan sotuvchilardan 3 barobar ko‘proq xarid qilishadi.
          </TipCallout>
          <GoogleLinkButton
            googleClientId={googleClientId}
            alreadyLinked={user.googleLinked}
            email={user.email}
          />
          <LinkTelegramButton
            botUsername={botUsername}
            alreadyLinked={user.telegramLinked}
            telegramUsername={user.telegramUsername}
          />
        </CardContent>
      </Card>

      {/* 4. System Info & Security Card */}
      <Card className="rounded-2xl border-border/80 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Fingerprint className="h-5 w-5 text-muted-foreground" />
            Tizim ma'lumotlari
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Qo'llab-quvvatlash xizmati bilan muloqotda ushbu identifikatorlardan foydalaning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-0 text-sm">
          {user.telegramId != null && (
            <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
              <span className="text-xs sm:text-sm font-medium text-muted-foreground">Telegram ID</span>
              <button
                type="button"
                onClick={() => copyText(String(user.telegramId), 'tgId')}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-xs font-semibold text-foreground hover:bg-muted transition"
              >
                <span>{user.telegramId}</span>
                {copiedKey === 'tgId' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground/70" />
                )}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">User ID</span>
            <button
              type="button"
              onClick={() => copyText(user.id, 'userId')}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-xs font-semibold text-foreground hover:bg-muted transition truncate max-w-[200px] sm:max-w-none"
            >
              <span className="truncate">{user.id}</span>
              {copiedKey === 'userId' ? (
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
              )}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">A'zolik sanasi</span>
            <span className="font-semibold text-xs sm:text-sm text-foreground">
              {joinedDate}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 py-1.5">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">Hisob darajasi</span>
            <span className="font-semibold text-xs sm:text-sm text-foreground">
              {user.roles?.map(r => r.replace('ROLE_', '')).join(', ') || 'USER'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Trade Admin Application if feature is active */}
      {FEATURES.humanAdmin && (
        <TradeAdminApplicationPanel
          application={tradeAdminApplication}
          isTradeAdmin={isTradeAdmin(user)}
          defaultContact={defaultContact}
        />
      )}

      {/* 5. Bottom Action: Chiqish */}
      <div className="pt-2 pb-6">
        <form action={logoutAction} className="w-full">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/80 bg-card px-6 py-3 text-sm font-semibold text-destructive hover:bg-destructive/10 transition shadow-2xs tap-press"
          >
            <LogOut className="h-4 w-4" />
            <span>Chiqish</span>
          </button>
        </form>
      </div>
    </div>
  );
}
