import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  Clock3,
  Gamepad2,
  Heart,
  MessageCircle,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
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

const HIGHLIGHTS = [
  { value: '1-9', label: "Division bo'yicha filter" },
  { value: '24 soat', label: 'Buyer-seller chat oynasi' },
  { value: 'Telegram', label: 'Login va media upload' },
  { value: 'Google', label: 'Tasdiqlangan profil signali' },
];

const MARKET_FEATURES = [
  {
    icon: SlidersHorizontal,
    title: 'Aniq marketplace filterlari',
    body: "Narx, division, team strength, coinlar, Google Play link va savdolashish bo'yicha saralash.",
  },
  {
    icon: Star,
    title: "Valuable playerlar bo'yicha qidiruv",
    body: "Listinglar Messi, Neymar, Mbappe yoki boshqa muhim playerlar bilan tez topiladi.",
  },
  {
    icon: WalletCards,
    title: 'EFHub card search bazasi',
    body: "Big Time, Epic va Showtime card ma'lumotlari akkount qiymatini tushunishni osonlashtiradi.",
  },
  {
    icon: Heart,
    title: 'Like va savat',
    body: "Xaridorlar yaxshi akkountlarni saqlab boradi, sotuvchilar esa qiziqishni ko'radi.",
  },
  {
    icon: MessageCircle,
    title: 'Spamni kamaytiradigan chat',
    body: 'Har xaridor bitta listing uchun bitta aktiv chat ochadi, muhim chatlar saqlanadi.',
  },
  {
    icon: UploadCloud,
    title: 'Telegram orqali media',
    body: "Sotuvchilar akkount rasmlarini tanish Telegram flowi orqali tez va tartibli yuklaydi.",
  },
];

const TRUST_ITEMS = [
  {
    icon: Bot,
    title: 'Telegram-first kirish',
    body: "Email-parol shovqinisiz boshlanadi, Telegram Mini App ichidan ham avtomatik kirish mavjud.",
  },
  {
    icon: ShieldCheck,
    title: 'Himoyalangan sessiya',
    body: "Kirish sessiyasi server tomonda tekshiriladi, profil ma'lumotlari himoyalangan flowda yuradi.",
  },
  {
    icon: BadgeCheck,
    title: 'Google bilan tasdiqlash',
    body: "Foydalanuvchi profilida Google ulab, xaridorlar uchun ishonch signalini kuchaytiradi.",
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Telegram orqali kiring',
    body: "Bot yoki Web App orqali profil yaratiladi. Google ulash keyinroq profilda qo'shiladi.",
  },
  {
    number: '02',
    title: 'Akkountni joylang yoki saralang',
    body: "Division, playerlar, team strength, coinlar va narx bilan e'lonlar aniq ko'rinadi.",
  },
  {
    number: '03',
    title: "Egasi bilan bog'laning",
    body: 'Listingdan chat boshlanadi, suhbatlar 24 soat ichida tartibli boshqariladi.',
  },
];

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <main className="min-h-screen overflow-hidden">
        <SiteHeader />

        <section className="container grid items-center gap-12 pb-14 pt-10 sm:pb-16 sm:pt-14 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:pb-20">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyber-cyan/25 bg-cyber-cyan/10 px-3 py-1 text-sm font-semibold text-cyber-cyan">
              <Sparkles className="h-4 w-4" />
              eFootball akkountlari uchun marketplace
            </div>

            <h1 className="text-6xl font-black leading-[0.92] text-foreground sm:text-7xl lg:text-8xl">
              <span className="text-gradient">efBazaar</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
              Uzbekistondagi eFootball o'yinchilari uchun akkount sotish, sotib olish,
              saralash va egasi bilan tez bog'lanish platformasi.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-[8px] px-6">
                <Link href="/marketplace/new">
                  Akkount joylash
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 rounded-[8px] px-6">
                <Link href="/marketplace">Bozorni ko'rish</Link>
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {['Telegram login', 'Verified profil', 'Anonim browse', 'Real filterlar'].map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-300"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <ProductPreview />
        </section>

        <section className="border-y border-white/10 bg-white/[0.035]">
          <div className="container grid gap-px sm:grid-cols-2 lg:grid-cols-4">
            {HIGHLIGHTS.map((item) => (
              <div key={item.label} className="py-7 sm:px-5">
                <div className="text-3xl font-black text-white">{item.value}</div>
                <div className="mt-1 text-sm text-slate-400">{item.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="marketplace" className="container py-16 sm:py-20">
          <SectionHeader
            eyebrow="Marketplace"
            title="Pro accountlarni tezroq topish uchun qurilgan."
            body="Narx, division, team strength, coinlar, muhim playerlar va savdolashish holati bilan xaridorlar kerakli akkountni tez saralaydi."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {MARKET_FEATURES.map(({ icon: Icon, title, body }) => (
              <article
                key={title}
                className="rounded-[8px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)]"
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

        <section id="trust" className="border-y border-white/10 bg-slate-950/45 py-16 sm:py-20">
          <div className="container grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <SectionHeader
              eyebrow="Ishonch"
              title="Savdo flowi Telegram va markaziy auth atrofida yig'ilgan."
              body="Profil, media va chat tajribasi xaridor hamda sotuvchi uchun tartibli, tanish va tekshiriladigan bo'lib qoladi."
            />

            <div className="grid gap-4">
              {TRUST_ITEMS.map(({ icon: Icon, title, body }) => (
                <article
                  key={title}
                  className="grid gap-4 rounded-[8px] border border-white/10 bg-white/[0.045] p-5 sm:grid-cols-[auto_1fr]"
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

        <section id="flow" className="container py-16 sm:py-20">
          <SectionHeader
            eyebrow="Flow"
            title="Sotuvchi va xaridor uchun qisqa yo'l."
            body="Platforma foydalanuvchini Telegram authdan listingga, listingdan esa egasi bilan suhbatga olib boradigan aniq yo'lga ega."
          />

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {STEPS.map((step) => (
              <article
                key={step.number}
                className="rounded-[8px] border border-white/10 bg-white/[0.04] p-6"
              >
                <div className="mb-8 text-sm font-black text-amber-300">{step.number}</div>
                <h3 className="text-xl font-bold text-white">{step.title}</h3>
                <p className="mt-3 leading-7 text-slate-400">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="container pb-16 sm:pb-20">
          <div className="grid gap-8 rounded-[8px] border border-cyber-cyan/20 bg-cyber-cyan/[0.06] p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase text-cyber-cyan">Boshlash</p>
              <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">
                eFootball akkount savdosini tartibli boshlang.
              </h2>
              <p className="mt-3 max-w-2xl leading-7 text-slate-300">
                Ro'yxatdan o'tish Telegram orqali ochiladi. Mavjud foydalanuvchilar esa login
                qilib profil va Google tasdiqlashni boshqaradi.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Button asChild size="lg" className="h-12 rounded-[8px] px-6">
                <Link href="/marketplace/new">
                  E'lon yaratish
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 rounded-[8px] px-6">
                <Link href={siteConfig.links.telegram}>Telegram bot</Link>
              </Button>
            </div>
          </div>
        </section>

        <SiteFooter />
      </main>
    </>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Logo size="md" />
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-300 md:flex">
          <Link href="/marketplace" className="transition hover:text-white">
            Bozor
          </Link>
          <Link href="#marketplace" className="transition hover:text-white">
            Marketplace
          </Link>
          <Link href="#trust" className="transition hover:text-white">
            Ishonch
          </Link>
          <Link href="#flow" className="transition hover:text-white">
            Flow
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden rounded-[8px] sm:inline-flex">
            <Link href="/auth/login">Kirish</Link>
          </Button>
          <Button asChild size="sm" className="rounded-[8px]">
            <Link href="/marketplace">Bozor</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl" aria-label="efBazaar marketplace preview">
      <div className="rounded-[8px] border border-white/10 bg-slate-950/[0.88] p-3 shadow-[0_28px_100px_rgba(0,0,0,0.42)] sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3 rounded-[8px] border border-white/10 bg-white/[0.045] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-400">
            <Search className="h-4 w-4 shrink-0 text-cyber-cyan" />
            <span className="truncate">Messi Big Time, Division 1, 3100+ strength</span>
          </div>
          <span className="rounded-full bg-emerald-400/12 px-2 py-1 text-xs font-bold text-emerald-300">
            aktiv
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-cyber-cyan">Top e'lon</p>
                <h2 className="mt-1 text-2xl font-black text-white">Division 1 akkount</h2>
              </div>
              <div className="rounded-[8px] bg-amber-300 px-2.5 py-1 text-sm font-black text-slate-950">
                PRO
              </div>
            </div>

            <div className="mb-4 grid min-h-[12rem] place-items-center rounded-[8px] border border-cyber-cyan/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(16,185,129,0.12)),#0f172a]">
              <div className="text-center">
                <Gamepad2 className="mx-auto h-12 w-12 text-cyber-cyan" />
                <div className="mt-3 text-5xl font-black text-white">3100+</div>
                <div className="mt-1 text-sm font-semibold text-slate-300">Team strength</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <Metric label="Division" value="1" />
              <Metric label="Android coin" value="8 400" />
              <Metric label="iOS coin" value="1 200" />
              <Metric label="Narx" value="450k" />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                <Trophy className="h-4 w-4 text-amber-300" />
                Muhim playerlar
              </div>
              <div className="flex flex-wrap gap-2">
                {['Messi', 'Neymar', 'Mbappe', 'Epic'].map((player) => (
                  <span
                    key={player}
                    className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-slate-300"
                  >
                    {player}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <MessageCircle className="h-4 w-4 text-emerald-300" />
                  Chat
                </div>
                <Clock3 className="h-4 w-4 text-slate-500" />
              </div>
              <div className="space-y-2">
                <div className="w-[86%] rounded-[8px] bg-cyber-cyan/15 px-3 py-2 text-sm text-cyan-50">
                  Akkount hali aktivmi?
                </div>
                <div className="ml-auto w-[78%] rounded-[8px] bg-emerald-400/15 px-3 py-2 text-sm text-emerald-50">
                  Ha, Google linked.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MiniStat icon={Heart} label="Like" value="128" />
              <MiniStat icon={ShoppingBag} label="Savat" value="42" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <MiniSignal icon={Zap} text="Tez saralash" />
        <MiniSignal icon={Users} text="Xaridor chat" />
        <MiniSignal icon={ShieldCheck} text="Profil tekshiruv" />
      </div>
    </div>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-slate-950/45 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-black text-white">{value}</div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
      <Icon className="h-4 w-4 text-cyber-cyan" />
      <div className="mt-2 text-xs text-slate-500">{label}</div>
      <div className="font-black text-white">{value}</div>
    </div>
  );
}

function MiniSignal({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex min-h-16 flex-col items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.04] px-2 text-center text-xs font-bold text-slate-300">
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
          <Link href="/auth/register" className="transition hover:text-white">
            Ro'yxatdan o'tish
          </Link>
          <Link href="/marketplace" className="transition hover:text-white">
            Marketplace
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
