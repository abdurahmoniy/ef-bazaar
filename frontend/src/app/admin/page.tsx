import Link from 'next/link';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowUpFromLine,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Flag,
  Inbox,
  Mail,
  Package,
  Percent,
  Plus,
  Radio,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  UserPlus,
  UsersRound,
  Wallet,
  XCircle,
} from 'lucide-react';

import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { getMe } from '@/lib/auth';
import { getAdminMailboxStats } from '@/lib/mailbox-admin-server';
import { formatListingDate } from '@/lib/marketplace-format';
import { getAdminStats, getAdminUsers } from '@/lib/marketplace-server';
import { formatTiyin } from '@/lib/money';
import {
  getUserbotStatusSSR,
  listPlatformCardsSSR,
  listUnmatchedSSR,
  listWithdrawalsSSR,
} from '@/lib/payment-admin-server';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const [
    statsResult,
    usersResult,
    mailboxStats,
    withdrawals,
    unmatched,
    platformCards,
    userbot,
    me,
  ] = await Promise.all([
    getAdminStats(),
    getAdminUsers(undefined, 0, 8),
    getAdminMailboxStats(),
    listWithdrawalsSSR(),
    listUnmatchedSSR(),
    listPlatformCardsSSR(),
    getUserbotStatusSSR(),
    getMe(),
  ]);

  if (!statsResult.ok) {
    return <ApiErrorPanel title="Statistika yuklanmadi" error={statsResult.error} />;
  }

  const stats = statsResult.data;
  const totalUsers = usersResult.ok ? usersResult.data.totalElements : 0;
  const recentUsers = usersResult.ok ? usersResult.data.content : [];

  // Payouts & Finance calculations
  const openWithdrawals = withdrawals?.filter((w) => w.status === 'OPEN') ?? [];
  const openWithdrawalsSum = openWithdrawals.reduce((acc, w) => acc + w.amountTiyin, 0);

  const pendingUnmatched = unmatched?.filter((u) => u.status === 'UNMATCHED') ?? [];
  const pendingUnmatchedSum = pendingUnmatched.reduce((acc, u) => acc + u.amountTiyin, 0);

  const activeCardsCount = platformCards?.filter((c) => c.active).length ?? 0;
  const totalCardsCount = platformCards?.length ?? 0;

  // Listings calculations
  const activeRate = stats.totalListings > 0
    ? Math.round((stats.activeListings / stats.totalListings) * 100)
    : 0;
  const soldRate = (stats.activeListings + stats.soldListings) > 0
    ? Math.round((stats.soldListings / (stats.activeListings + stats.soldListings)) * 100)
    : 0;

  // Actionable alert count
  const actionRequiredCount =
    (stats.pendingReports > 0 ? 1 : 0) +
    (openWithdrawals.length > 0 ? 1 : 0) +
    (pendingUnmatched.length > 0 ? 1 : 0) +
    (mailboxStats && mailboxStats.pending > 0 ? 1 : 0);

  return (
    <div className="space-y-8">
      {/* ─── Hero / Header Overview ──────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/5 p-6 md:p-8 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                Boshqaruv markazi
              </span>
              {actionRequiredCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  {actionRequiredCount} ta eʼtibor talab holat
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Tizim barqaror
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
              Assalomu alaykum, {me?.displayName || 'Admin'}
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Platformaning barcha bo‘limlari: eʼlonlar, foydalanuvchilar, to‘lovlar, pochtalar va xavfsizlik monitoringi.
            </p>
          </div>

          {/* Observer Status Pill */}
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-border/80 bg-background/80 px-4 py-3 shadow-xs">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    userbot?.healthy
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-destructive animate-ping',
                  )}
                />
                <span className="text-xs font-bold">
                  {userbot?.healthy ? 'Humo Observer: Faol' : 'Humo Observer: Aloqada emas'}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {userbot?.lastSeenAt
                  ? `So‘nggi signal: ${formatListingDate(userbot.lastSeenAt)}`
                  : 'Avtomatik depozit nazorati'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Key KPI Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Users */}
        <Link
          href="/admin/users"
          className="group rounded-xl border border-border bg-card p-5 shadow-xs transition hover:border-primary/50 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Foydalanuvchilar</span>
            <div className="rounded-lg bg-primary/10 p-2 text-primary transition-transform group-hover:scale-110">
              <UsersRound className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black tracking-tight tabular-nums text-foreground">
              {usersResult.ok ? totalUsers.toLocaleString('ru-RU') : '—'}
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <span>Ro‘yxatdan o‘tgan barcha hisoblar</span>
            </div>
          </div>
        </Link>

        {/* Active Listings */}
        <Link
          href="/admin/listings?status=ACTIVE"
          className="group rounded-xl border border-border bg-card p-5 shadow-xs transition hover:border-emerald-500/50 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Aktiv Eʼlonlar</span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 transition-transform group-hover:scale-110">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black tracking-tight tabular-nums text-foreground">
              {stats.activeListings.toLocaleString('ru-RU')}
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Jami {stats.totalListings} tadan {activeRate}%</span>
            </div>
          </div>
        </Link>

        {/* Sold Listings */}
        <Link
          href="/admin/listings?status=SOLD"
          className="group rounded-xl border border-border bg-card p-5 shadow-xs transition hover:border-amber-500/50 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sotilgan Akkauntlar</span>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 transition-transform group-hover:scale-110">
              <Package className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black tracking-tight tabular-nums text-foreground">
              {stats.soldListings.toLocaleString('ru-RU')}
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 font-medium">
              <span>Muvaffaqiyatli bitimlar: {soldRate}%</span>
            </div>
          </div>
        </Link>

        {/* Moderation / Reports */}
        <Link
          href="/admin/reports"
          className={cn(
            'group rounded-xl border p-5 shadow-xs transition hover:shadow-md',
            stats.pendingReports > 0
              ? 'border-destructive/50 bg-destructive/5 hover:border-destructive'
              : 'border-border bg-card hover:border-primary/50',
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Shikoyatlar</span>
            <div
              className={cn(
                'rounded-lg p-2 transition-transform group-hover:scale-110',
                stats.pendingReports > 0
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-primary/10 text-primary',
              )}
            >
              <Flag className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight tabular-nums text-foreground">
                {stats.pendingReports}
              </span>
              <span className="text-xs font-medium text-muted-foreground">kutilmoqda</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Jami shikoyatlar: {stats.totalReports} ta
            </div>
          </div>
        </Link>
      </div>

      {/* ─── Finance & Operations Section ──────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-black tracking-tight">Moliya & To‘lov Tizimi</h2>
          </div>
          <Link
            href="/admin/payments/cards"
            className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
          >
            Barcha to‘lov sozlamalari <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Pending Withdrawals Card */}
          <Link
            href="/admin/payments/withdrawals"
            className={cn(
              'group rounded-xl border p-5 transition hover:shadow-md',
              openWithdrawals.length > 0
                ? 'border-amber-500/40 bg-amber-500/5 hover:border-amber-500'
                : 'border-border bg-card hover:border-primary/40',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpFromLine className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Pul yechish so‘rovlari
                </span>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-bold',
                  openWithdrawals.length > 0
                    ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {openWithdrawals.length} ta ochiq
              </span>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-black tabular-nums text-foreground">
                {formatTiyin(openWithdrawalsSum)} <span className="text-sm font-semibold text-muted-foreground">so‘m</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Foydalanuvchilarga to‘lanishi kerak bo‘lgan summa
              </p>
            </div>
          </Link>

          {/* Unmatched Inbound Deposits */}
          <Link
            href="/admin/payments/unmatched"
            className={cn(
              'group rounded-xl border p-5 transition hover:shadow-md',
              pendingUnmatched.length > 0
                ? 'border-destructive/40 bg-destructive/5 hover:border-destructive'
                : 'border-border bg-card hover:border-primary/40',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Nomaʼlum tushumlar
                </span>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-bold',
                  pendingUnmatched.length > 0
                    ? 'bg-destructive/20 text-destructive'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {pendingUnmatched.length} ta birikmagan
              </span>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-black tabular-nums text-foreground">
                {formatTiyin(pendingUnmatchedSum)} <span className="text-sm font-semibold text-muted-foreground">so‘m</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Avtomatik birikmagan tushumlarni qo‘lda rasmiylashtirish
              </p>
            </div>
          </Link>

          {/* Platform Receiving Cards */}
          <Link
            href="/admin/payments/cards"
            className="group rounded-xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Platforma kartalari
                </span>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600">
                {activeCardsCount} / {totalCardsCount} aktiv
              </span>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-black tabular-nums text-foreground">
                {activeCardsCount} ta karta
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Tushumlar qabul qilinayotgan platforma hisoblari
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* ─── Split Grid: Mailboxes & Listings Breakdown ─────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Listings Distribution breakdown */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-base">Eʼlonlar statusi taqsimoti</h3>
            </div>
            <Link
              href="/admin/listings"
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              Eʼlonlar boshqaruvi <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Segmented Progress Bar */}
          <div className="space-y-2">
            <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                style={{ width: `${stats.totalListings ? (stats.activeListings / stats.totalListings) * 100 : 0}%` }}
                className="bg-emerald-500 transition-all"
                title={`Aktiv: ${stats.activeListings}`}
              />
              <div
                style={{ width: `${stats.totalListings ? (stats.soldListings / stats.totalListings) * 100 : 0}%` }}
                className="bg-amber-500 transition-all"
                title={`Sotilgan: ${stats.soldListings}`}
              />
              <div
                style={{ width: `${stats.totalListings ? (stats.deletedListings / stats.totalListings) * 100 : 0}%` }}
                className="bg-destructive transition-all"
                title={`O'chirilgan: ${stats.deletedListings}`}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <div className="font-bold text-emerald-700 dark:text-emerald-400">
                  {stats.activeListings} ta
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Aktiv eʼlonlar</div>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-2">
                <div className="font-bold text-amber-700 dark:text-amber-400">
                  {stats.soldListings} ta
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Sotilgan</div>
              </div>
              <div className="rounded-lg bg-destructive/10 p-2">
                <div className="font-bold text-destructive">
                  {stats.deletedListings} ta
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">O‘chirilgan</div>
              </div>
            </div>
          </div>
        </div>

        {/* Mailboxes & Escrow infrastructure */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-base">Pochtalar & Konami Escrow</h3>
            </div>
            <Link
              href="/admin/mailboxes"
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              Pochtalar nazorati <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border/80 bg-background/50 p-3 text-center">
              <div className="text-xl font-black tabular-nums">{mailboxStats?.total ?? '—'}</div>
              <div className="text-[11px] font-semibold text-muted-foreground mt-1">Jami pochtalar</div>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/50 p-3 text-center">
              <div className="text-xl font-black tabular-nums text-primary">{mailboxStats?.trade ?? '—'}</div>
              <div className="text-[11px] font-semibold text-muted-foreground mt-1">Savdo (Trade)</div>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/50 p-3 text-center">
              <div className="text-xl font-black tabular-nums text-emerald-600">{mailboxStats?.admin ?? '—'}</div>
              <div className="text-[11px] font-semibold text-muted-foreground mt-1">Admin pochtalar</div>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/50 p-3 text-center">
              <div className="text-xl font-black tabular-nums text-amber-600">{mailboxStats?.unassigned ?? '—'}</div>
              <div className="text-[11px] font-semibold text-muted-foreground mt-1">Bo‘sh zaxira</div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-2.5 text-xs">
            <span className="text-muted-foreground">Kutilayotgan provisioning:</span>
            <span className="font-bold">{mailboxStats?.pending ?? 0} ta</span>
          </div>
        </div>
      </div>

      {/* ─── Recent Users & Quick Actions ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Registered Users */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-base">Yangi ro‘yxatdan o‘tgan foydalanuvchilar</h3>
            </div>
            <Link
              href="/admin/users"
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              Barchasini ko‘rish <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
            {recentUsers.length > 0 ? (
              recentUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-3 transition hover:bg-muted/30">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                      {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold">{user.displayName || 'Anonim'}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {user.telegramUsername ? `@${user.telegramUsername}` : user.email || 'Identifikator mavjud'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {user.roles?.includes('ROLE_ADMIN') && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        Admin
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {formatListingDate(user.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="p-4 text-center text-xs text-muted-foreground">Foydalanuvchilar topilmadi</p>
            )}
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-base">Tezkor Amallar</h3>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <Link
              href="/admin/payments/cards"
              className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-xs font-semibold transition hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <CreditCard className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div>Yangi karta qo‘shish</div>
                <div className="text-[11px] font-normal text-muted-foreground">Tushum kartalarini sozlash</div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>

            <Link
              href="/admin/mailboxes"
              className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-xs font-semibold transition hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Mail className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div>Yangi pochta yaratish</div>
                <div className="text-[11px] font-normal text-muted-foreground">Konami escrow pochta ochish</div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>

            <Link
              href="/admin/reports"
              className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-xs font-semibold transition hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Flag className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div>Shikoyatlarni ko‘rish</div>
                <div className="text-[11px] font-normal text-muted-foreground">Moderatsiya arizalari</div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>

            <Link
              href="/admin/payments/commission"
              className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-xs font-semibold transition hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Percent className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div>Komissiya stavkalari</div>
                <div className="text-[11px] font-normal text-muted-foreground">Savdo foizlarini o‘zgartirish</div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
