import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Clock3,
  Gamepad2,
  Heart,
  MessageCircle,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  UploadCloud,
  Users,
  WalletCards,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { absoluteUrl, siteConfig } from '@/lib/site';

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteConfig.url}/#organization`,
      name: siteConfig.name,
      url: siteConfig.url,
      logo: absoluteUrl('/icon'),
      sameAs: [siteConfig.links.telegram],
    },
    {
      '@type': 'WebSite',
      '@id': `${siteConfig.url}/#website`,
      url: siteConfig.url,
      name: siteConfig.name,
      description: siteConfig.description,
      inLanguage: 'uz-UZ',
      publisher: {
        '@id': `${siteConfig.url}/#organization`,
      },
    },
    {
      '@type': 'WebApplication',
      '@id': `${siteConfig.url}/#webapp`,
      name: siteConfig.name,
      url: siteConfig.url,
      applicationCategory: 'MarketplaceApplication',
      operatingSystem: 'Web, Telegram',
      inLanguage: 'uz-UZ',
      description: siteConfig.description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'UZS',
      },
    },
  ],
};

const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c');

const DESK_METRICS = [
  { icon: Trophy, label: 'Division window', value: '1-9', tone: 'cyan' },
  { icon: Clock3, label: 'Chat expiry', value: '24 soat', tone: 'emerald' },
  { icon: BadgeCheck, label: 'Profile signal', value: 'Google', tone: 'amber' },
  { icon: Bot, label: 'Login rail', value: 'Telegram', tone: 'rose' },
];

const LIVE_DEALS = [
  { title: 'Division 1 pro squad', price: '450k', strength: '3100+', badge: 'Google' },
  { title: 'Epic player stack', price: '690k', strength: '3280', badge: 'Savdo' },
  { title: 'Coin-rich starter', price: '280k', strength: '2760', badge: 'Telegram' },
];

const PLAYER_TAGS = ['Messi', 'Neymar', 'Mbappe', 'Epic', 'Big Time'];

const WORKFLOW = [
  {
    icon: SlidersHorizontal,
    title: 'Browse like analytics',
    body: "Division, price, strength, coins and player tags sit in fixed scan zones, so account comparison feels fast.",
  },
  {
    icon: ShieldCheck,
    title: 'Check visible trust',
    body: 'Telegram-first access, Google profile signal and server-side session rules stay visible without extra promises.',
  },
  {
    icon: MessageCircle,
    title: 'Move into chat',
    body: "Buyers continue from a listing into the seller chat flow, while create-listing stays one click away.",
  },
];

const PLATFORM_CARDS = [
  {
    icon: Heart,
    title: 'Shortlist surface',
    body: "Like and cart actions become part of the marketplace dashboard instead of hidden afterthoughts.",
  },
  {
    icon: UploadCloud,
    title: 'Seller desk',
    body: 'Create-listing entry points stay direct, with account stats and media flow designed for repeated use.',
  },
  {
    icon: WalletCards,
    title: 'Value signals',
    body: 'Player names, coin balances and team strength read as market signals, not just text fields.',
  },
];

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <main className="dashboard-surface min-h-screen overflow-hidden text-slate-950">
        <HeroSection />
        <WorkflowSection />
        <PlatformSection />
        <FinalCta />
        <SiteFooter />
      </main>
    </>
  );
}

function HeroSection() {
  return (
    <section className="container py-4 sm:py-6 lg:min-h-screen">
      <div className="grid gap-4 lg:grid-cols-[5rem_minmax(0,1fr)]">
        <DeskRail />
        <div className="space-y-4">
          <SiteHeader />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <HeroPanel />
            <LiveMarketCockpit />
          </div>
          <DeskMetrics />
        </div>
      </div>
    </section>
  );
}

function DeskRail() {
  return (
    <aside className="hidden min-h-[calc(100vh-2rem)] flex-col items-center justify-between rounded-[8px] border border-white/70 bg-white/45 px-3 py-4 shadow-[0_18px_70px_rgba(15,23,42,0.12)] backdrop-blur-2xl lg:flex">
      <div className="flex flex-col items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-[8px] bg-slate-950 text-cyan-200 shadow-[0_18px_40px_rgba(15,23,42,0.25)]">
          <Gamepad2 className="h-6 w-6" />
        </div>
        {[Search, Trophy, Heart, MessageCircle].map((Icon, index) => (
          <div
            key={index}
            className="grid h-10 w-10 place-items-center rounded-[8px] border border-slate-200/80 bg-white/70 text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
          >
            <Icon className="h-4 w-4" />
          </div>
        ))}
      </div>
      <div className="grid h-10 w-10 place-items-center rounded-[8px] bg-emerald-400/90 text-slate-950">
        <Zap className="h-4 w-4" />
      </div>
    </aside>
  );
}

function SiteHeader() {
  return (
    <header className="rounded-[8px] border border-white/70 bg-white/55 px-3 py-3 shadow-[0_18px_70px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
      <div className="flex items-center justify-between gap-3">
        <Logo size="md" />
        <nav className="hidden items-center gap-2 rounded-[8px] border border-slate-200/80 bg-white/55 p-1 text-sm font-bold text-slate-600 md:flex">
          <Link href="/marketplace" className="rounded-[8px] px-3 py-2 transition hover:bg-slate-950 hover:text-white">
            Bozor
          </Link>
          <Link href="#workflow" className="rounded-[8px] px-3 py-2 transition hover:bg-slate-950 hover:text-white">
            Workflow
          </Link>
          <Link href="#platform" className="rounded-[8px] px-3 py-2 transition hover:bg-slate-950 hover:text-white">
            Platform
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden rounded-[8px] text-slate-700 sm:inline-flex">
            <Link href="/auth/login">Kirish</Link>
          </Button>
          <Button asChild size="sm" className="rounded-[8px] bg-slate-950 px-3 text-white hover:bg-slate-800">
            <Link href="/marketplace">
              <Search className="h-4 w-4" />
              Bozor
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function HeroPanel() {
  return (
    <div className="relative min-h-[34rem] overflow-hidden rounded-[8px] border border-white/70 bg-white/50 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.14)] backdrop-blur-2xl sm:p-7 lg:min-h-[calc(100vh-9.5rem)]">
      <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(90deg,rgba(34,211,238,0.22),rgba(16,185,129,0.16),rgba(245,158,11,0.22))]" />
      <div className="relative flex h-full flex-col justify-between gap-10">
        <div>
          <div className="mb-6 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-[8px] border border-cyan-200/80 bg-cyan-50/80 px-3 py-2 text-sm font-black text-cyan-800">
              <Sparkles className="h-4 w-4" />
              Glass trade desk
            </span>
            <span className="inline-flex items-center gap-2 rounded-[8px] border border-amber-200/80 bg-amber-50/85 px-3 py-2 text-sm font-black text-amber-800">
              Soft analytics layer
            </span>
          </div>

          <h1 className="text-6xl font-black leading-[0.86] text-slate-950 sm:text-7xl lg:text-8xl">
            efBazaar
          </h1>
          <p className="mt-6 max-w-xl text-2xl font-black leading-tight text-slate-800 sm:text-3xl">
            eFootball account savdosi uchun marketplace cockpit.
          </p>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
            Accountlarni division, strength, coin, player va trust signallari bilan ko'ring.
            Landing endi oddiy promo emas, product dashboardga kirish eshigi.
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button asChild size="lg" className="h-14 rounded-[8px] bg-slate-950 px-6 text-white shadow-[0_18px_45px_rgba(15,23,42,0.24)] hover:bg-slate-800">
              <Link href="/marketplace">
                Bozorni ko'rish
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-14 rounded-[8px] border-slate-300 bg-white/70 px-6 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] hover:bg-white"
            >
              <Link href="/marketplace/new">Akkount joylash</Link>
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <HeroSignal icon={Search} label="Browse" />
            <HeroSignal icon={BadgeCheck} label="Google signal" />
            <HeroSignal icon={Clock3} label="24 soat chat" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveMarketCockpit() {
  return (
    <div className="grid gap-4 lg:grid-rows-[auto_1fr]">
      <div className="rounded-[8px] border border-slate-900/10 bg-slate-950 p-4 text-white shadow-[0_24px_90px_rgba(15,23,42,0.22)]">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-cyan-300">Live market cockpit</p>
            <h2 className="mt-1 text-2xl font-black">Listing intelligence</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-[8px] bg-emerald-300 px-3 py-2 text-xs font-black text-slate-950">
            <span className="h-2 w-2 rounded-full bg-slate-950" />
            Online market
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[8px] border border-white/10 bg-white/[0.07] p-4">
            <div className="mb-4 flex items-center gap-2 rounded-[8px] bg-white px-3 py-3 text-sm font-bold text-slate-700">
              <Search className="h-4 w-4 shrink-0 text-cyan-600" />
              <span className="truncate">Messi Big Time, Division 1</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <CockpitMetric label="Div" value="1" />
              <CockpitMetric label="Power" value="3100+" />
              <CockpitMetric label="UZS" value="450k" />
            </div>
            <div className="mt-4 grid min-h-44 place-items-center rounded-[8px] border border-cyan-200/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.25),rgba(16,185,129,0.18),rgba(245,158,11,0.18))]">
              <div className="text-center">
                <Gamepad2 className="mx-auto h-12 w-12 text-cyan-200" />
                <div className="mt-3 text-5xl font-black">8 400</div>
                <div className="text-sm font-bold text-slate-300">Android coin</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[8px] border border-white/10 bg-white/[0.07] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-slate-400">Market board</p>
                  <h3 className="text-lg font-black">Top active deals</h3>
                </div>
                <WalletCards className="h-5 w-5 text-amber-300" />
              </div>
              <div className="space-y-2">
                {LIVE_DEALS.map((deal) => (
                  <div
                    key={deal.title}
                    className="grid grid-cols-[1fr_auto] gap-3 rounded-[8px] border border-white/10 bg-white/[0.07] p-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black">{deal.title}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-400">{deal.strength} strength</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black">{deal.price}</div>
                      <div className="mt-1 text-[11px] font-black text-emerald-300">{deal.badge}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <CockpitTile icon={Heart} label="Likes" value="128" />
              <CockpitTile icon={ShoppingBag} label="Cart" value="42" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_0.82fr]">
        <div className="rounded-[8px] border border-white/70 bg-white/55 p-4 shadow-[0_18px_65px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-black text-slate-950">Player signal stack</h3>
            <Trophy className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex flex-wrap gap-2">
            {PLAYER_TAGS.map((player) => (
              <span
                key={player}
                className="rounded-[8px] border border-slate-200 bg-white/75 px-3 py-2 text-xs font-black text-slate-700"
              >
                {player}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-[8px] border border-white/70 bg-white/55 p-4 shadow-[0_18px_65px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-black text-slate-950">
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              Seller chat
            </div>
            <div className="text-xs font-black text-slate-500">24 soat</div>
          </div>
          <div className="space-y-2 text-sm font-bold">
            <div className="w-[88%] rounded-[8px] bg-cyan-100 px-3 py-2 text-cyan-950">Akkount aktivmi?</div>
            <div className="ml-auto w-[78%] rounded-[8px] bg-emerald-100 px-3 py-2 text-emerald-950">Ha, Google linked.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeskMetrics() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {DESK_METRICS.map(({ icon: Icon, label, value, tone }) => (
        <div
          key={label}
          className="rounded-[8px] border border-white/70 bg-white/55 p-4 shadow-[0_16px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-slate-500">{label}</div>
              <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
            </div>
            <div className={metricTone(tone)}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkflowSection() {
  return (
    <section id="workflow" className="container py-14 sm:py-20">
      <SectionHeader
        eyebrow="Workflow"
        title="Not a landing page. A buyer decision surface."
        body="The page now behaves visually like the platform it sells: scan first, compare second, act third."
      />
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {WORKFLOW.map(({ icon: Icon, title, body }, index) => (
          <article
            key={title}
            className="rounded-[8px] border border-white/70 bg-white/55 p-5 shadow-[0_18px_65px_rgba(15,23,42,0.10)] backdrop-blur-2xl"
          >
            <div className="mb-8 flex items-center justify-between">
              <div className="grid h-11 w-11 place-items-center rounded-[8px] bg-slate-950 text-cyan-200">
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-sm font-black text-slate-400">0{index + 1}</span>
            </div>
            <h3 className="text-xl font-black text-slate-950">{title}</h3>
            <p className="mt-3 leading-7 text-slate-600">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PlatformSection() {
  return (
    <section id="platform" className="container pb-14 sm:pb-20">
      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-[8px] bg-slate-950 p-6 text-white shadow-[0_24px_90px_rgba(15,23,42,0.22)] sm:p-8">
          <p className="text-sm font-black uppercase text-cyan-300">Modern SaaS Analytics Dashboard</p>
          <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">Whole platform direction</h2>
          <p className="mt-5 leading-8 text-slate-300">
            Marketplace, detail, profile and create-listing pages should inherit this lighter desk system:
            glass shell, dense metrics, clear action zones and Soft UI controls.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {PLATFORM_CARDS.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-[8px] border border-white/70 bg-white/55 p-5 shadow-[0_18px_65px_rgba(15,23,42,0.10)] backdrop-blur-2xl"
            >
              <div className="mb-8 grid h-11 w-11 place-items-center rounded-[8px] bg-cyan-100 text-cyan-800">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-black text-slate-950">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="container pb-14 sm:pb-20">
      <div className="grid gap-6 rounded-[8px] border border-slate-950/10 bg-white/65 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.14)] backdrop-blur-2xl sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-sm font-black uppercase text-cyan-700">Start trading desk</p>
          <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">Bozorni oching yoki account joylang.</h2>
          <p className="mt-3 max-w-2xl leading-7 text-slate-600">
            Same routes, stronger product surface: browse anonymously, then login for listing, cart and chat actions.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
          <Button asChild size="lg" className="h-12 rounded-[8px] bg-slate-950 px-6 text-white hover:bg-slate-800">
            <Link href="/marketplace">
              Bozorni ko'rish
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 rounded-[8px] border-slate-300 bg-white px-6 text-slate-950 hover:bg-slate-50">
            <Link href="/marketplace/new">Akkount joylash</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-black uppercase text-cyan-700">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-5xl">{title}</h2>
      <p className="mt-4 leading-8 text-slate-600">{body}</p>
    </div>
  );
}

function HeroSignal({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex min-h-14 items-center gap-2 rounded-[8px] border border-slate-200/90 bg-white/65 px-3 text-xs font-black text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:text-sm lg:text-xs xl:text-sm">
      <Icon className="h-4 w-4 shrink-0 text-cyan-700" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function CockpitMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.08] p-3">
      <div className="text-xs font-black uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-black text-white">{value}</div>
    </div>
  );
}

function CockpitTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.07] p-3">
      <Icon className="h-4 w-4 text-cyan-300" />
      <div className="mt-2 text-xs font-bold text-slate-400">{label}</div>
      <div className="text-lg font-black text-white">{value}</div>
    </div>
  );
}

function metricTone(tone: string) {
  if (tone === 'cyan') return 'grid h-11 w-11 place-items-center rounded-[8px] bg-cyan-100 text-cyan-800';
  if (tone === 'emerald') return 'grid h-11 w-11 place-items-center rounded-[8px] bg-emerald-100 text-emerald-800';
  if (tone === 'amber') return 'grid h-11 w-11 place-items-center rounded-[8px] bg-amber-100 text-amber-800';
  return 'grid h-11 w-11 place-items-center rounded-[8px] bg-rose-100 text-rose-800';
}

function SiteFooter() {
  return (
    <footer className="border-t border-slate-950/10 py-8">
      <div className="container flex flex-col gap-4 text-sm font-semibold text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <Logo size="sm" />
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/marketplace" className="transition hover:text-slate-950">
            Marketplace
          </Link>
          <Link href="/marketplace/new" className="transition hover:text-slate-950">
            Akkount joylash
          </Link>
          <Link href="/auth/login" className="transition hover:text-slate-950">
            Kirish
          </Link>
          <Link href={siteConfig.links.telegram} className="transition hover:text-slate-950">
            Telegram
          </Link>
        </div>
      </div>
    </footer>
  );
}
