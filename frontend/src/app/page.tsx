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

const MARKET_SIGNALS = [
  { value: '1-9', label: 'Division filterlari', detail: 'Akkount darajasini tez saralash' },
  { value: '24 soat', label: 'Chat oynasi', detail: 'Buyer va seller suhbati tartibli' },
  { value: 'Google', label: 'Profil signali', detail: "Ulangan profil ishonchni ko'rsatadi" },
  { value: 'Telegram', label: 'Kirish va media', detail: 'Bot va Web App oqimi bilan' },
];

const FEATURE_CARDS = [
  {
    icon: SlidersHorizontal,
    title: 'Filter bilan tez saralash',
    body: "Narx, division, team strength, coinlar, playerlar va savdolashish holati bir joyda ko'rinadi.",
  },
  {
    icon: Trophy,
    title: "Player qiymatini ko'rish",
    body: "Messi, Neymar, Mbappe, Epic va Big Time kabi muhim playerlar listingda ajralib turadi.",
  },
  {
    icon: ShieldCheck,
    title: 'Trust signallari',
    body: "Telegram-first login, Google profil holati va seller identifikatori aniq product flowda yuradi.",
  },
  {
    icon: Heart,
    title: 'Saqlash va qiziqish',
    body: "Like va savat signallari xaridorga shortlist, sellerga esa qiziqish ko'rsatadi.",
  },
  {
    icon: MessageCircle,
    title: 'Seller bilan chat',
    body: 'Xaridor listingdan egasiga chiqadi, aktiv suhbatlar spamni kamaytiradigan qoidalar bilan boshqariladi.',
  },
  {
    icon: UploadCloud,
    title: 'Akkountni joylash',
    body: 'Seller listing yaratadi, account metrikalarini kiritadi va media oqimini Telegram orqali davom ettiradi.',
  },
];

const TRUST_PANELS = [
  {
    icon: Bot,
    title: 'Telegram-first kirish',
    body: 'Kirish, Mini App va bot oqimi foydalanuvchini tanish muhitda boshlatadi.',
  },
  {
    icon: BadgeCheck,
    title: 'Google profil signali',
    body: "Profilga Google ulash xaridor uchun qo'shimcha ishonch signali beradi.",
  },
  {
    icon: ShieldCheck,
    title: 'Server tomonda sessiya',
    body: 'Himoyalangan amallar mavjud auth flow orqali tekshiriladi, tokenlar browser JS ga ochilmaydi.',
  },
];

const FLOW_STEPS = [
  {
    number: '01',
    title: "Bozorni ko'ring",
    body: "Anonim browse ochiq: listinglar, metrikalar va player teglarini tez ko'ring.",
  },
  {
    number: '02',
    title: 'Akkountni baholang',
    body: 'Division, team strength, coinlar, narx va Google signali asosida shortlist qiling.',
  },
  {
    number: '03',
    title: "Egasi bilan bog'laning",
    body: "Login qiling, listingdan chat boshlang yoki o'zingiz akkount joylang.",
  },
];

const PREVIEW_LISTINGS = [
  { name: 'Division 1 account', price: '450k', strength: '3100+', signal: 'Google' },
  { name: 'Epic player pack', price: '690k', strength: '3280', signal: 'Negotiable' },
  { name: 'Coin-rich starter', price: '280k', strength: '2760', signal: 'Telegram' },
];

const PLAYER_TAGS = ['Messi', 'Neymar', 'Mbappe', 'Epic', 'Big Time'];

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,rgba(2,6,23,0.98)_0%,rgba(15,23,42,0.96)_48%,rgba(2,6,23,1)_100%)]">
        <SiteHeader />
        <HeroSection />
        <MarketSignals />
        <FeatureSection />
        <TrustSection />
        <FlowSection />
        <FinalCta />
        <SiteFooter />
      </main>
    </>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-2xl">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Logo size="md" />
        <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-300 md:flex">
          <Link href="/marketplace" className="transition hover:text-white">
            Bozor
          </Link>
          <Link href="#marketplace" className="transition hover:text-white">
            Marketplace
          </Link>
          <Link href="#trust" className="transition hover:text-white">
            Trust
          </Link>
          <Link href="#flow" className="transition hover:text-white">
            Flow
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden rounded-[8px] sm:inline-flex">
            <Link href="/auth/login">Kirish</Link>
          </Button>
          <Button asChild size="sm" className="rounded-[8px] px-3">
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

function HeroSection() {
  return (
    <section className="container grid items-center gap-10 pb-14 pt-8 sm:pb-16 sm:pt-12 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[0.94fr_1.06fr] lg:gap-12 lg:pb-12">
      <div className="max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-sm font-semibold text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl">
          <Sparkles className="h-4 w-4 text-amber-300" />
          eFootball akkountlari uchun premium marketplace
        </div>

        <h1 className="text-5xl font-black leading-[0.96] text-white sm:text-6xl lg:text-7xl">
          <span className="text-gradient">efBazaar</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
          Division, playerlar, coinlar, narx va trust signallarini bir joyda ko'rib,
          eFootball akkount savdosini tartibli boshlang.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-12 rounded-[8px] px-6 shadow-[0_16px_45px_rgba(34,211,238,0.18)]">
            <Link href="/marketplace">
              Bozorni ko'rish
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 rounded-[8px] border-white/15 bg-white/[0.04] px-6 backdrop-blur-xl"
          >
            <Link href="/marketplace/new">Akkount joylash</Link>
          </Button>
        </div>

        <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
          <HeroChip icon={Search} label="Anonim browse" />
          <HeroChip icon={BadgeCheck} label="Google signal" />
          <HeroChip icon={MessageCircle} label="24 soat chat" />
        </div>
      </div>

      <MarketplaceCommandCenter />
    </section>
  );
}

function MarketplaceCommandCenter() {
  return (
    <div className="relative mx-auto w-full max-w-2xl" aria-label="efBazaar marketplace preview">
      <div className="rounded-[8px] border border-white/12 bg-white/[0.07] p-3 shadow-[0_30px_110px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:p-4">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-cyber-cyan">Marketplace command center</p>
            <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">Account market pulse</h2>
          </div>
          <div className="flex items-center gap-2 rounded-[8px] border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-bold text-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            Aktiv listinglar
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-3">
            <div className="rounded-[8px] border border-white/10 bg-slate-950/60 p-3">
              <div className="mb-3 flex items-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-slate-300">
                <Search className="h-4 w-4 shrink-0 text-cyber-cyan" />
                <span className="truncate">Messi Big Time, Division 1, 3100+ strength</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <PreviewMetric label="Division" value="1" tone="cyan" />
                <PreviewMetric label="Strength" value="3100+" tone="emerald" />
                <PreviewMetric label="Narx" value="450k" tone="amber" />
              </div>
            </div>

            <div className="rounded-[8px] border border-white/10 bg-white/[0.045] p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-amber-200">Featured account</p>
                  <h3 className="mt-1 truncate text-2xl font-black text-white">Division 1 pro squad</h3>
                </div>
                <div className="rounded-[8px] bg-amber-300 px-2.5 py-1 text-sm font-black text-slate-950">
                  PRO
                </div>
              </div>

              <div className="grid min-h-40 place-items-center rounded-[8px] border border-cyber-cyan/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.16),rgba(16,185,129,0.10)_48%,rgba(245,158,11,0.10)),rgba(15,23,42,0.86)]">
                <div className="text-center">
                  <Gamepad2 className="mx-auto h-11 w-11 text-cyber-cyan" />
                  <div className="mt-3 text-5xl font-black text-white">8 400</div>
                  <div className="mt-1 text-sm font-semibold text-slate-300">Android coin</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {PLAYER_TAGS.map((player) => (
                  <span
                    key={player}
                    className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-bold text-slate-200"
                  >
                    {player}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-[8px] border border-white/10 bg-slate-950/50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">Market list</p>
                  <h3 className="text-base font-black text-white">Top accounts</h3>
                </div>
                <WalletCards className="h-5 w-5 text-amber-300" />
              </div>
              <div className="space-y-2">
                {PREVIEW_LISTINGS.map((listing) => (
                  <div
                    key={listing.name}
                    className="grid grid-cols-[1fr_auto] gap-3 rounded-[8px] border border-white/10 bg-white/[0.045] p-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-white">{listing.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{listing.strength} strength</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-white">{listing.price}</div>
                      <div className="mt-1 text-[11px] font-bold text-emerald-300">{listing.signal}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[8px] border border-white/10 bg-white/[0.045] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <MessageCircle className="h-4 w-4 text-emerald-300" />
                  Seller chat
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
                  <Clock3 className="h-3.5 w-3.5" />
                  24 soat
                </div>
              </div>
              <div className="space-y-2">
                <div className="w-[88%] rounded-[8px] bg-cyber-cyan/15 px-3 py-2 text-sm text-cyan-50">
                  Akkount hali aktivmi?
                </div>
                <div className="ml-auto w-[78%] rounded-[8px] bg-emerald-400/15 px-3 py-2 text-sm text-emerald-50">
                  Ha, Google linked.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <PreviewStat icon={Heart} label="Like" value="128" />
              <PreviewStat icon={ShoppingBag} label="Savat" value="42" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <MiniSignal icon={Zap} text="Tez saralash" />
        <MiniSignal icon={Users} text="Xaridor chat" />
        <MiniSignal icon={ShieldCheck} text="Profil signali" />
      </div>
    </div>
  );
}

function MarketSignals() {
  return (
    <section className="border-y border-white/10 bg-white/[0.035]">
      <div className="container grid gap-px sm:grid-cols-2 lg:grid-cols-4">
        {MARKET_SIGNALS.map((item) => (
          <div key={item.label} className="py-6 sm:px-5">
            <div className="text-3xl font-black text-white">{item.value}</div>
            <div className="mt-1 text-sm font-bold text-slate-300">{item.label}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatureSection() {
  return (
    <section id="marketplace" className="container py-16 sm:py-20">
      <SectionHeader
        eyebrow="Marketplace"
        title="Akkount tanlash uchun product dashboard."
        body="efBazaar listinglarni oddiy e'lon emas, qaror qabul qilishga yordam beradigan metrikalar bilan ko'rsatadi."
      />

      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FEATURE_CARDS.map(({ icon: Icon, title, body }) => (
          <article
            key={title}
            className="rounded-[8px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:border-cyber-cyan/35 hover:bg-white/[0.075]"
          >
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-cyber-cyan/25 bg-cyber-cyan/10 text-cyber-cyan">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="mt-2 leading-7 text-slate-400">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section id="trust" className="border-y border-white/10 bg-slate-950/45 py-16 sm:py-20">
      <div className="container grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <SectionHeader
          eyebrow="Trust"
          title="Ishonch signallari mavjud auth flowga suyanadi."
          body="Platforma Telegram, Google profil signali va server tomonda tekshiriladigan sessiyalar bilan ishlaydi. Keraksiz va'dalar yo'q, productda bor signallar aniq ko'rinadi."
        />

        <div className="grid gap-4">
          {TRUST_PANELS.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="grid gap-4 rounded-[8px] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-xl sm:grid-cols-[auto_1fr]"
            >
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] bg-emerald-400/12 text-emerald-300">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{title}</h3>
                <p className="mt-2 leading-7 text-slate-400">{body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FlowSection() {
  return (
    <section id="flow" className="container py-16 sm:py-20">
      <SectionHeader
        eyebrow="Flow"
        title="Browse, inspect, chat."
        body="Landingdan boshlangan yo'l real marketplace sahifalariga ulanadi: xaridor ko'radi, baholaydi va egasiga chiqadi."
      />

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {FLOW_STEPS.map((step) => (
          <article
            key={step.number}
            className="rounded-[8px] border border-white/10 bg-white/[0.045] p-6 backdrop-blur-xl"
          >
            <div className="mb-8 text-sm font-black text-amber-300">{step.number}</div>
            <h3 className="text-xl font-bold text-white">{step.title}</h3>
            <p className="mt-3 leading-7 text-slate-400">{step.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="container pb-16 sm:pb-20">
      <div className="grid gap-8 rounded-[8px] border border-cyber-cyan/20 bg-white/[0.06] p-6 shadow-[0_22px_90px_rgba(0,0,0,0.24)] backdrop-blur-2xl sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-sm font-bold uppercase text-cyber-cyan">Boshlash</p>
          <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">
            eFootball akkount savdosini product flow bilan boshlang.
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-slate-300">
            Bozorni anonim ko'ring yoki login qilib account listing yaratish, saqlash va chat
            amallarini davom ettiring.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
          <Button asChild size="lg" className="h-12 rounded-[8px] px-6">
            <Link href="/marketplace">
              Bozorni ko'rish
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 rounded-[8px] px-6">
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
      <p className="text-sm font-black uppercase text-cyber-cyan">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">{title}</h2>
      <p className="mt-4 leading-8 text-slate-400">{body}</p>
    </div>
  );
}

function HeroChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.045] px-3 text-sm font-bold text-slate-200 backdrop-blur-xl">
      <Icon className="h-4 w-4 shrink-0 text-emerald-300" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'cyan' | 'emerald' | 'amber';
}) {
  const toneClass =
    tone === 'cyan'
      ? 'text-cyber-cyan'
      : tone === 'emerald'
        ? 'text-emerald-300'
        : 'text-amber-300';

  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.045] p-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-black ${toneClass}`}>{value}</div>
    </div>
  );
}

function PreviewStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.045] p-3">
      <Icon className="h-4 w-4 text-cyber-cyan" />
      <div className="mt-2 text-xs text-slate-500">{label}</div>
      <div className="font-black text-white">{value}</div>
    </div>
  );
}

function MiniSignal({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex min-h-16 flex-col items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.045] px-2 text-center text-xs font-bold text-slate-300 backdrop-blur-xl">
      <Icon className="mb-1.5 h-4 w-4 text-emerald-300" />
      <span>{text}</span>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-white/10 py-8">
      <div className="container flex flex-col gap-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <Logo size="sm" />
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/marketplace" className="transition hover:text-white">
            Marketplace
          </Link>
          <Link href="/marketplace/new" className="transition hover:text-white">
            Akkount joylash
          </Link>
          <Link href="/auth/login" className="transition hover:text-white">
            Kirish
          </Link>
          <Link href={siteConfig.links.telegram} className="transition hover:text-white">
            Telegram
          </Link>
        </div>
      </div>
    </footer>
  );
}
