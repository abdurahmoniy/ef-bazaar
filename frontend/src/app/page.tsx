import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Clock3,
  Filter,
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
  type LucideIcon,
} from 'lucide-react';

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

const ACCOUNT_FILTERS = ['Division 1', '3100+', 'Epic', 'Google', 'Savdo bor'];

const LISTINGS = [
  {
    title: 'D1 Epic core',
    price: '450k',
    meta: '3100+ strength',
    signal: 'Google',
    tone: 'mint',
  },
  {
    title: 'Coin heavy',
    price: '280k',
    meta: '8 400 coin',
    signal: 'Telegram',
    tone: 'sky',
  },
  {
    title: 'Starter clean',
    price: '190k',
    meta: 'Division 4',
    signal: '24 soat',
    tone: 'clay',
  },
];

const ACCOUNT_STATS = [
  { label: 'Division', value: '1', tone: 'ink' },
  { label: 'Strength', value: '3100+', tone: 'mint' },
  { label: 'Coins', value: '8 400', tone: 'amber' },
  { label: 'Price', value: '450k', tone: 'sky' },
];

const SIGNALS = [
  { icon: Bot, label: 'Telegram login', value: 'familiar entry' },
  { icon: BadgeCheck, label: 'Google signal', value: 'profile linked' },
  { icon: Clock3, label: '24 soat chat', value: 'clear reply window' },
  { icon: ShieldCheck, label: 'Server session', value: 'checked actions' },
];

const BUYER_STEPS = [
  {
    icon: Search,
    title: 'Scan without noise',
    body: 'Price, division, strength and player tags sit in one quiet row, so buyers compare accounts faster.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Filter by intent',
    body: 'Chips stay small and tactile: Division, coin balance, Epic players, Google signal and negotiation state.',
  },
  {
    icon: MessageCircle,
    title: 'Move to seller chat',
    body: 'The path from listing to chat stays obvious, with the 24 soat rule visible before the buyer clicks.',
  },
];

const SELLER_STEPS = [
  {
    icon: UploadCloud,
    title: 'Post from one place',
    body: 'Listing creation is treated as a primary action, not a secondary footer link.',
  },
  {
    icon: WalletCards,
    title: 'Show market value',
    body: 'Coins, team strength, division and player names become structured signals instead of loose text.',
  },
  {
    icon: Users,
    title: 'Read buyer interest',
    body: 'Likes, cart saves and chat intent remain visible as lightweight marketplace feedback.',
  },
];

const PLATFORM_NOTES = [
  'Porcelain background, warm ink text and restrained emerald, orange and blue accents.',
  'Soft UI controls use inset depth and quiet borders instead of neon gradients.',
  'Marketplace-first content: every section points back to browse, list, filter or chat.',
];

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <main className="dashboard-surface min-h-screen overflow-hidden text-stone-950">
        <LandingHeader />
        <MarketSheet />
        <SignalStrip />
        <FlowSection />
        <DirectionSection />
        <FinalCta />
        <SiteFooter />
      </main>
    </>
  );
}

function LandingHeader() {
  return (
    <header className="container pt-5">
      <div className="soft-panel flex items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <Link href="/" className="flex items-center gap-3" aria-label="efBazaar home">
          <span className="grid h-10 w-10 place-items-center rounded-[8px] bg-stone-950 text-stone-50 shadow-[8px_8px_18px_rgba(41,37,36,0.14)]">
            <Gamepad2 className="h-5 w-5" />
          </span>
          <span className="text-lg font-black tracking-normal text-stone-950">efBazaar</span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-[8px] bg-stone-100/70 p-1 text-sm font-bold text-stone-600 shadow-[inset_4px_4px_9px_rgba(120,113,108,0.12),inset_-4px_-4px_9px_rgba(255,255,255,0.9)] md:flex">
          <Link href="/marketplace" className="rounded-[8px] px-3 py-2 transition hover:bg-white hover:text-stone-950">
            Market
          </Link>
          <Link href="#buyer" className="rounded-[8px] px-3 py-2 transition hover:bg-white hover:text-stone-950">
            Buyer
          </Link>
          <Link href="#seller" className="rounded-[8px] px-3 py-2 transition hover:bg-white hover:text-stone-950">
            Seller
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/auth/login"
            className="hidden min-h-10 items-center rounded-[8px] px-3 text-sm font-black text-stone-600 transition hover:text-stone-950 sm:flex"
          >
            Kirish
          </Link>
          <ActionLink href="/marketplace" label="Bozor" icon={Search} compact />
        </div>
      </div>
    </header>
  );
}

function MarketSheet() {
  return (
    <section className="container py-5 sm:py-8">
      <div className="soft-panel min-h-[calc(100vh-7.5rem)] p-3 sm:p-5 lg:p-6">
        <div className="grid min-h-[calc(100vh-10.5rem)] gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(20rem,0.56fr)]">
          <div className="flex min-w-0 flex-col justify-between gap-8 rounded-[8px] bg-white/42 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:p-7">
            <div>
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <Pill icon={Sparkles}>Quiet account market</Pill>
                <Pill>Minimal Soft UI marketplace</Pill>
              </div>

              <p className="text-sm font-black uppercase tracking-normal text-orange-700">eFootball account marketplace</p>
              <h1 className="mt-4 max-w-4xl text-5xl font-black leading-[0.92] tracking-normal text-stone-950 sm:text-6xl lg:text-7xl">
                Browse with signal, not noise.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-stone-600 sm:text-lg">
                efBazaar endi sokin, aniq va tactile marketplace sifatida ochiladi: listinglar,
                filterlar, trust signallari va chat oqimi birinchi ekranning o'zida ko'rinadi.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <ActionLink href="/marketplace" label="Bozorni ko'rish" icon={ArrowRight} />
                <SecondaryLink href="/marketplace/new" label="Akkount joylash" icon={UploadCloud} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="soft-inset flex min-h-14 items-center gap-3 px-3">
                <Search className="h-5 w-5 shrink-0 text-stone-500" />
                <span className="min-w-0 truncate text-sm font-bold text-stone-500">
                  Messi Epic, Division 1, 3100+ strength
                </span>
                <Filter className="ml-auto h-5 w-5 shrink-0 text-orange-700" />
              </div>
              <div className="flex flex-wrap gap-2">
                {ACCOUNT_FILTERS.map((filter) => (
                  <span
                    key={filter}
                    className="rounded-[8px] border border-white/80 bg-stone-50/80 px-3 py-2 text-xs font-black text-stone-600 shadow-[5px_5px_12px_rgba(120,113,108,0.10),-5px_-5px_12px_rgba(255,255,255,0.9)]"
                  >
                    {filter}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <AccountConsole />
        </div>
      </div>
    </section>
  );
}

function AccountConsole() {
  return (
    <aside className="soft-panel grid min-h-[32rem] gap-3 p-3">
      <div className="rounded-[8px] bg-stone-950 p-4 text-stone-50 shadow-[12px_12px_24px_rgba(41,37,36,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-emerald-200">Market sheet</p>
            <h2 className="mt-1 text-2xl font-black">Selected account</h2>
          </div>
          <span className="rounded-[8px] bg-emerald-200 px-3 py-2 text-xs font-black text-stone-950">Online</span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {ACCOUNT_STATS.map((stat) => (
            <StatTile key={stat.label} {...stat} />
          ))}
        </div>

        <div className="mt-5 rounded-[8px] border border-white/10 bg-white/[0.06] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-stone-400">Player stack</p>
              <p className="mt-1 text-lg font-black">Messi, Neymar, Mbappe</p>
            </div>
            <Trophy className="h-6 w-6 text-amber-200" />
          </div>
          <div className="mt-4 h-2 rounded-full bg-white/10">
            <div className="h-2 w-[78%] rounded-full bg-emerald-200" />
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {LISTINGS.map((listing) => (
          <ListingRow key={listing.title} {...listing} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TinyAction icon={Heart} label="Likes" value="128" />
        <TinyAction icon={ShoppingBag} label="Cart" value="42" />
      </div>
    </aside>
  );
}

function SignalStrip() {
  return (
    <section className="container pb-5 sm:pb-8">
      <div className="grid gap-3 md:grid-cols-4">
        {SIGNALS.map(({ icon: Icon, label, value }) => (
          <div key={label} className="soft-panel p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-[8px] bg-white/70 text-stone-700 shadow-[inset_3px_3px_7px_rgba(120,113,108,0.10),inset_-3px_-3px_7px_rgba(255,255,255,0.9)]">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-stone-950">{label}</p>
                <p className="truncate text-xs font-bold text-stone-500">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FlowSection() {
  return (
    <section className="container py-10 sm:py-14">
      <div className="grid gap-5 lg:grid-cols-2">
        <FlowColumn
          id="buyer"
          eyebrow="Buyer flow"
          title="Minimal comparison, then direct chat."
          steps={BUYER_STEPS}
        />
        <FlowColumn
          id="seller"
          eyebrow="Seller flow"
          title="Post account value without extra clutter."
          steps={SELLER_STEPS}
        />
      </div>
    </section>
  );
}

function FlowColumn({
  id,
  eyebrow,
  title,
  steps,
}: {
  id: string;
  eyebrow: string;
  title: string;
  steps: Array<{ icon: LucideIcon; title: string; body: string }>;
}) {
  return (
    <div id={id} className="min-w-0">
      <p className="text-sm font-black uppercase text-orange-700">{eyebrow}</p>
      <h2 className="mt-3 max-w-xl text-3xl font-black leading-tight text-stone-950 sm:text-4xl">{title}</h2>

      <div className="mt-6 space-y-3">
        {steps.map(({ icon: Icon, title: stepTitle, body }) => (
          <article key={stepTitle} className="soft-panel grid gap-4 p-4 sm:grid-cols-[auto_1fr]">
            <span className="grid h-11 w-11 place-items-center rounded-[8px] bg-stone-950 text-emerald-100">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-black text-stone-950">{stepTitle}</h3>
              <p className="mt-2 leading-7 text-stone-600">{body}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function DirectionSection() {
  return (
    <section className="container pb-10 sm:pb-14">
      <div className="grid gap-4 lg:grid-cols-[0.78fr_1fr]">
        <div>
          <p className="text-sm font-black uppercase text-orange-700">Whole platform direction</p>
          <h2 className="mt-3 max-w-xl text-3xl font-black leading-tight text-stone-950 sm:text-4xl">
            Softer, quieter, more marketplace-native.
          </h2>
        </div>
        <div className="soft-panel divide-y divide-stone-200/70 p-2">
          {PLATFORM_NOTES.map((note) => (
            <div key={note} className="flex gap-3 px-3 py-4 text-sm font-bold leading-7 text-stone-600 sm:text-base">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
              <span>{note}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="container pb-12 sm:pb-16">
      <div className="soft-panel grid gap-5 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-sm font-black uppercase text-orange-700">Start</p>
          <h2 className="mt-2 text-3xl font-black text-stone-950 sm:text-4xl">Bozor ochiq. Listing tayyor.</h2>
          <p className="mt-3 max-w-2xl leading-7 text-stone-600">
            Birinchi yo'l xaridorga, ikkinchi yo'l sellerga: ikkalasi ham marketplace flowga to'g'ri ulanadi.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ActionLink href="/marketplace" label="Bozorni ko'rish" icon={ArrowRight} />
          <SecondaryLink href="/marketplace/new" label="Akkount joylash" icon={UploadCloud} />
        </div>
      </div>
    </section>
  );
}

function ListingRow({
  title,
  price,
  meta,
  signal,
  tone,
}: {
  title: string;
  price: string;
  meta: string;
  signal: string;
  tone: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[8px] bg-stone-50/75 p-3 shadow-[7px_7px_16px_rgba(120,113,108,0.12),-7px_-7px_16px_rgba(255,255,255,0.92)]">
      <span className={listingTone(tone)} />
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-stone-950">{title}</p>
        <p className="truncate text-xs font-bold text-stone-500">{meta}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-black text-stone-950">{price}</p>
        <p className="text-xs font-black text-orange-700">{signal}</p>
      </div>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.07] p-3">
      <p className="text-xs font-black uppercase text-stone-400">{label}</p>
      <p className={statTone(tone)}>{value}</p>
    </div>
  );
}

function TinyAction({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="soft-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase text-stone-500">{label}</p>
          <p className="mt-1 text-2xl font-black text-stone-950">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-orange-700" />
      </div>
    </div>
  );
}

function Pill({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[8px] border border-white/80 bg-white/60 px-3 py-2 text-xs font-black text-stone-700 shadow-[5px_5px_12px_rgba(120,113,108,0.10),-5px_-5px_12px_rgba(255,255,255,0.9)]">
      {Icon ? <Icon className="h-4 w-4 text-orange-700" /> : null}
      {children}
    </span>
  );
}

function ActionLink({
  href,
  label,
  icon: Icon,
  compact = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-stone-950 font-black text-stone-50 shadow-[8px_8px_18px_rgba(41,37,36,0.16)] transition hover:-translate-y-0.5 hover:bg-stone-800 ${
        compact ? 'px-3 text-sm' : 'px-5 text-sm sm:text-base'
      }`}
    >
      <span>{label}</span>
      <Icon className="h-4 w-4" />
    </Link>
  );
}

function SecondaryLink({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-stone-100/70 px-5 text-sm font-black text-stone-800 shadow-[inset_5px_5px_10px_rgba(120,113,108,0.13),inset_-5px_-5px_10px_rgba(255,255,255,0.95)] transition hover:bg-white sm:text-base"
    >
      <span>{label}</span>
      <Icon className="h-4 w-4" />
    </Link>
  );
}

function listingTone(tone: string) {
  if (tone === 'mint') return 'h-10 w-2 rounded-full bg-emerald-400';
  if (tone === 'sky') return 'h-10 w-2 rounded-full bg-sky-400';
  return 'h-10 w-2 rounded-full bg-orange-500';
}

function statTone(tone: string) {
  if (tone === 'mint') return 'mt-1 text-2xl font-black text-emerald-200';
  if (tone === 'amber') return 'mt-1 text-2xl font-black text-amber-200';
  if (tone === 'sky') return 'mt-1 text-2xl font-black text-sky-200';
  return 'mt-1 text-2xl font-black text-stone-50';
}

function SiteFooter() {
  return (
    <footer className="border-t border-stone-300/70 py-8">
      <div className="container flex flex-col gap-4 text-sm font-bold text-stone-500 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="font-black text-stone-950">efBazaar</Link>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/marketplace" className="transition hover:text-stone-950">
            Marketplace
          </Link>
          <Link href="/marketplace/new" className="transition hover:text-stone-950">
            Akkount joylash
          </Link>
          <Link href="/auth/login" className="transition hover:text-stone-950">
            Kirish
          </Link>
          <Link href={siteConfig.links.telegram} className="transition hover:text-stone-950">
            Telegram
          </Link>
        </div>
      </div>
    </footer>
  );
}
