'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity,
  BellRing,
  ArrowLeft,
  ArrowUpFromLine,
  Bot,
  Handshake,
  Headphones,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  Flag,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Mail,
  Menu,
  MessagesSquare,
  Package,
  Percent,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  UserCog,
  UserPlus,
  UsersRound,
  X,
  Video,
} from 'lucide-react';

import { FEATURES } from '@/lib/feature-flags';
import {
  BADGE_PARTNER_APPLICATIONS,
  BADGE_WITHDRAWALS,
  getAdminBadges,
  type AdminBadges,
} from '@/lib/partners';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Ishora kaliti — backend qaytaradigan sanoq shu nom ostida keladi.
   * Bo'sh bo'lsa bo'limda ishora ko'rsatilmaydi.
   */
  badge?: string;
}

export interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    title: 'Boshqaruv',
    items: [
      {
        href: '/admin',
        label: 'Boshqaruv paneli',
        shortLabel: 'Statistika',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: 'commerce',
    title: 'Savdo & Moderatsiya',
    items: [
      {
        href: '/admin/listings',
        label: "E'lonlar katalogi",
        shortLabel: "E'lonlar",
        icon: Package,
      },
      {
        href: '/admin/trades',
        label: 'Faol savdolar',
        shortLabel: 'Savdolar',
        icon: Activity,
      },
      {
        href: '/admin/chats',
        label: 'Chatlar (anonim)',
        shortLabel: 'Chatlar',
        icon: MessagesSquare,
      },
      {
        href: '/admin/reports',
        label: 'Shikoyatlar',
        icon: Flag,
      },
      {
        href: '/admin/support',
        label: 'Murojaatlar & Chat',
        shortLabel: 'Support',
        icon: Headphones,
      },
      {
        href: '/admin/trust',
        label: 'Trust & Xavfsizlik',
        shortLabel: 'Trust',
        icon: ShieldAlert,
      },
    ],
  },
  {
    id: 'finance',
    title: "Moliya & To'lovlar",
    items: [
      {
        href: '/admin/payments/cards',
        label: 'Platforma kartalari',
        shortLabel: 'Kartalar',
        icon: CreditCard,
      },
      {
        href: '/admin/payments/unmatched',
        label: 'Tushumlar (Unmatched)',
        shortLabel: 'Tushumlar',
        icon: Inbox,
      },
      {
        href: '/admin/payments/withdrawals',
        label: 'Pul yechish so‘rovlari',
        shortLabel: 'Yechishlar',
        icon: ArrowUpFromLine,
        badge: BADGE_WITHDRAWALS,
      },
      {
        href: '/admin/payments/commission',
        label: 'Komissiya sozlamalari',
        shortLabel: 'Komissiya',
        icon: Percent,
      },
    ],
  },
  {
    id: 'users',
    title: 'Foydalanuvchilar',
    items: [
      {
        href: '/admin/users',
        label: 'Foydalanuvchilar bazasi',
        shortLabel: 'Foydalanuvchilar',
        icon: UsersRound,
      },
      {
        href: '/admin/partners',
        label: 'Hamkorlar',
        icon: Handshake,
        badge: BADGE_PARTNER_APPLICATIONS,
      },
      {
        href: '/admin/referrals',
        label: 'Referallar',
        icon: UserPlus,
      },
      {
        href: '/admin/access-requirements',
        label: 'Kirish shartlari',
        icon: ListChecks,
      },
      ...(FEATURES.humanAdmin
        ? [
            {
              href: '/admin/trade-admin-applications',
              label: 'Admin arizalari',
              icon: ClipboardCheck,
            },
            {
              href: '/admin/human-trades',
              label: 'Inson admin',
              icon: UserCog,
            },
          ]
        : []),
    ],
  },
  {
    id: 'system',
    title: 'Tizim & Resurslar',
    items: [
      { href: '/admin/popups', label: 'Pop-up xabarlar', icon: BellRing },
      {
        href: '/admin/mailboxes',
        label: 'Pochtalar (Mailboxes)',
        shortLabel: 'Pochtalar',
        icon: Mail,
      },
      {
        href: '/admin/userbots',
        label: 'Userbotlar (Telegram)',
        shortLabel: 'Userbotlar',
        icon: Send,
      },
      {
        href: '/admin/players',
        label: 'O‘yinchilar bazasi',
        shortLabel: 'O‘yinchilar',
        icon: Sparkles,
      },
      {
        href: '/admin/attributes',
        label: 'Atributlar & Filterlar',
        shortLabel: 'Atributlar',
        icon: SlidersHorizontal,
      },
      {
        href: '/admin/bot',
        label: 'Bot sozlamalari',
        shortLabel: 'Bot',
        icon: Bot,
      },
      {
        href: '/admin/guides',
        label: "Video qo'llanmalar",
        shortLabel: "Qo'llanmalar",
        icon: Video,
      },
    ],
  },
];

interface AdminShellProps {
  user: User;
  children?: React.ReactNode;
}

export function isRouteActive(pathname: string, href: string): boolean {
  if (href === '/admin') {
    return pathname === '/admin';
  }
  return pathname.startsWith(href);
}

export function getActiveBreadcrumbs(pathname: string): { groupTitle?: string; itemLabel?: string } {
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      if (isRouteActive(pathname, item.href)) {
        return {
          groupTitle: group.title,
          itemLabel: item.label,
        };
      }
    }
  }
  return { groupTitle: 'Boshqaruv', itemLabel: 'Admin' };
}

export function AdminShell({ user, children }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [badges, setBadges] = useState<AdminBadges>({});

  // Ishoralar davriy yangilanadi: yangi ariza yoki pul yechish so'rovi
  // admin sahifani ochib turganda ham kelishi mumkin va u buni sahifani
  // qayta yuklamasdan ko'rishi kerak.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getAdminBadges()
        .then((next) => {
          if (!cancelled) setBadges(next);
        })
        .catch(() => {
          // Ishora ko'rsatilmagani xato emas — panel ishlashda davom etadi.
        });
    };
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname]);

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const breadcrumbs = getActiveBreadcrumbs(pathname);

  const renderNavLinks = (compact = false) => (
    <div className="space-y-6 px-3 py-4">
      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group.id} className="space-y-1.5">
          {!compact && (
            <div className="px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
              {group.title}
            </div>
          )}
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = isRouteActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={compact ? item.label : undefined}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                    compact && 'justify-center px-2 py-2.5',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-transform group-hover:scale-110',
                      active ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  />
                  {!compact && (
                    <span className="truncate">{item.label}</span>
                  )}
                  {/*
                    Ishora: doira ichida ko'rilmagan elementlar soni.
                    Nol bo'lsa umuman chizilmaydi — bo'sh doira "ish bor"
                    degan noto'g'ri signal berardi.

                    Yig'ilgan holatda (compact) yozuv sig'maydi, shuning
                    uchun ikonka ustida kichik nuqta qoladi: son ko'rinmasa
                    ham "bu yerda ish bor" degani yo'qolmasligi kerak.
                  */}
                  {item.badge && (badges[item.badge] ?? 0) > 0 && (
                    compact ? (
                      <span
                        aria-label={`${badges[item.badge]} ta yangi`}
                        className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive"
                      />
                    ) : (
                      <span
                        className={cn(
                          'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                          active
                            ? 'bg-primary-foreground text-primary'
                            : 'bg-destructive text-destructive-foreground',
                        )}
                      >
                        {badges[item.badge]}
                      </span>
                    )
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/20 text-foreground flex flex-col">
      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Slide-over Drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-card border-r border-border shadow-2xl transition-transform duration-300 ease-in-out lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Drawer Header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="font-black text-base tracking-tight leading-tight">eFBazaar</div>
              <div className="text-[11px] font-semibold text-muted-foreground leading-none">ERP & Boshqaruv</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Yopish"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Navigation */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {renderNavLinks(false)}
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-border p-3 bg-muted/30">
          <div className="flex items-center gap-3 rounded-lg p-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
              {user.displayName ? user.displayName[0].toUpperCase() : 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold leading-tight">{user.displayName || 'Admin'}</div>
              <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Super Admin
              </div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-border/50">
            <Link
              href="/marketplace"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Store className="h-3.5 w-3.5" />
              Marketplacega qaytish
            </Link>
          </div>
        </div>
      </aside>

      <div className="flex flex-1">
        {/* Desktop Fixed / Collapsible Sidebar */}
        <aside
          className={cn(
            'hidden lg:flex lg:flex-col shrink-0 border-r border-border bg-card transition-all duration-300 ease-in-out sticky top-0 h-screen z-30',
            isCollapsed ? 'w-18' : 'w-64',
          )}
        >
          {/* Desktop Sidebar Header */}
          <div className="flex h-16 items-center justify-between border-b border-border px-4">
            <div className={cn('flex items-center gap-2.5 overflow-hidden', isCollapsed && 'justify-center w-full')}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </div>
              {!isCollapsed && (
                <div className="truncate">
                  <div className="font-black text-base tracking-tight leading-tight">eFBazaar</div>
                  <div className="text-[11px] font-semibold text-muted-foreground leading-none">ERP & Boshqaruv</div>
                </div>
              )}
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
            {renderNavLinks(isCollapsed)}
          </div>

          {/* Desktop Sidebar Footer */}
          <div className="border-t border-border p-3 bg-muted/20">
            {!isCollapsed ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg bg-card/60 p-2 border border-border/60">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                    {user.displayName ? user.displayName[0].toUpperCase() : 'A'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold leading-tight">{user.displayName || 'Admin'}</div>
                    <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Administrator
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Link
                    href="/marketplace"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    title="Marketplacega o'tish"
                  >
                    <Store className="h-3.5 w-3.5" />
                    <span>Marketplace</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setIsCollapsed(true)}
                    className="inline-flex items-center justify-center rounded-lg border border-border bg-background p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    title="Sidebar-ni kichraytirish"
                    aria-label="Kichraytirish"
                  >
                    <ChevronRight className="h-3.5 w-3.5 rotate-180" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Link
                  href="/marketplace"
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                  title="Marketplace"
                >
                  <Store className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setIsCollapsed(false)}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                  title="Sidebar-ni kengaytirish"
                  aria-label="Kengaytirish"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area with Header */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Navbar */}
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card/90 px-4 md:px-6 backdrop-blur-md">
            <div className="flex items-center gap-3 min-w-0">
              {/* Mobile menu trigger */}
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
                aria-label="Menyuni ochish"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Breadcrumbs */}
              <div className="flex items-center gap-2 text-xs md:text-sm font-medium overflow-hidden">
                <span className="text-muted-foreground hidden sm:inline">{breadcrumbs.groupTitle}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 hidden sm:inline" />
                <span className="font-bold text-foreground truncate">{breadcrumbs.itemLabel}</span>
              </div>
            </div>

            {/* Top Right Utilities */}
            <div className="flex items-center gap-2.5">
              {/* Live Status Badge */}
              <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Tizim faol
              </div>

              {/* Marketplace Link */}
              <Link
                href="/marketplace"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Marketplace</span>
              </Link>
            </div>
          </header>

          {/* Main Dashboard Canvas */}
          <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
