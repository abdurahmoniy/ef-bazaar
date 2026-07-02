import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  Bot,
  BadgeCheck,
  Clock3,
  Filter,
  Heart,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react';

import { Logo } from '@/components/brand/logo';
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

const ACCOUNT_FILTERS = ['Diviziyon 1', '3100+ kuch', 'Epic', 'Google', 'Savdo bor'];

const SHOWCASE_LISTING = {
  division: 1,
  strength: 3150,
  price: "450 000 so'm",
  coins: '8 400',
  players: ['Messi', 'Neymar', 'Mbappe'],
};

const TICKER_ITEMS = [
  "D1 · 3150 kuch · 450 000 so'm",
  "D3 · 2800 kuch · 210 000 so'm",
  "D1 · 3300 kuch · 620 000 so'm",
  "D5 · 2400 kuch · 140 000 so'm",
  "D2 · 3050 kuch · 380 000 so'm",
  "D4 · 2650 kuch · 175 000 so'm",
  "D1 · 3400 kuch · 700 000 so'm",
  "D6 · 2200 kuch · 95 000 so'm",
];

const DIVISIONS = [9, 8, 7, 6, 5, 4, 3, 2, 1];

const BUYER_STEPS = [
  {
    title: 'Filtrlang',
    body: "Diviziyon, jamoa kuchi, tanga miqdori va narx bo'yicha filtrlab, mos akkountni soniyalarda toping.",
  },
  {
    title: "E'lonni ko'ring",
    body: "Rasmlar, tavsif va akkountdagi muhim o'yinchilar ro'yxatini batafsil ko'rib chiqing.",
  },
  {
    title: 'Sotuvchiga yozing',
    body: '"Egasi bilan bog\'lanish" tugmasi orqali chat oching — 24 soat ichida javob olasiz.',
  },
];

const SELLER_STEPS = [
  {
    title: "Ro'yxatdan o'ting",
    body: "Telegram yoki Google orqali bir bosishda kiring — parol o'ylab topish shart emas.",
  },
  {
    title: "E'lon joylang",
    body: "Narx, diviziyon, tanga miqdori va rasmlarni qo'shing — e'loningiz darhol bozorda ko'rinadi.",
  },
  {
    title: 'Xaridorni kuting',
    body: "Layk, savatga qo'shish va chat so'rovlari orqali qiziqishni real vaqtda kuzating.",
  },
];

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: 'Har bir amal serverda tekshiriladi',
    body: "Layk bosish, savatga qo'shish, chat ochish — barchasi tasdiqlangan sessiyangiz orqali, sizning nomingizdan amalga oshiriladi.",
  },
  {
    icon: Bot,
    title: 'Telegram orqali bir bosishda kirish',
    body: "Parol o'ylab topish shart emas — Telegram akkountingiz bilan darhol ro'yxatdan o'tasiz.",
  },
  {
    icon: BadgeCheck,
    title: 'Google bilan tasdiqlangan profil',
    body: 'Google akkountingizni ulab, profilingizga "tasdiqlangan" belgisini oling.',
  },
  {
    icon: Clock3,
    title: '24 soatlik chat oynasi',
    body: 'Suhbat 24 soatdan keyin avtomatik yopiladi. Muhim kelishuvni "Muhim" deb belgilab, uni saqlab qoling.',
  },
];

const FAQ_ITEMS = [
  {
    question: "To'lovni qanday amalga oshiraman?",
    answer:
      "efBazaar to'lovni o'z ichiga olmaydi — narx va to'lov usuli sotuvchi bilan chat orqali o'zaro kelishiladi. Faqat ishonchli tomonlar bilan savdo qiling.",
  },
  {
    question: 'Rasmlarni qanday joylayman?',
    answer:
      "E'lon yaratishda rasmlaringizni to'g'ridan-to'g'ri saytga yuklaysiz (JPG, PNG, WebP yoki HEIC, 1 dan 10 tagacha).",
  },
  {
    question: 'Necha vaqt ichida javob olaman?',
    answer:
      "Sotuvchiga yozgan chatingiz 24 soat davom etadi. Shu vaqt ichida javob bo'lmasa, chat avtomatik yopiladi.",
  },
  {
    question: 'Akkount ma\'lumotlarim xavfsizmi?',
    answer:
      "Platformadagi barcha amallar tasdiqlangan sessiya orqali amalga oshiriladi. Akkount login-parolini esa faqat kelishilgan xaridoringizga, savdo yakunida bering.",
  },
];

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <main className="min-h-screen bg-background text-foreground">
        <LandingHeader />
        <Hero />
        <DivisionLadder />
        <HowItWorks />
        <TrustGrid />
        <Faq />
        <FinalCta />
        <SiteFooter />
      </main>
    </>
  );
}

function LandingHeader() {
  return (
    <header className="container py-5">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-3 shadow-card sm:px-4">
        <Logo size="sm" href="/" />

        <nav className="hidden items-center gap-1 rounded-lg bg-muted p-1 text-sm font-bold text-muted-foreground md:flex">
          <Link href="/marketplace" className="rounded-lg px-3 py-2 transition hover:bg-white hover:text-foreground">
            Bozor
          </Link>
          <Link href="#qanday-ishlaydi" className="rounded-lg px-3 py-2 transition hover:bg-white hover:text-foreground">
            Qanday ishlaydi
          </Link>
          <Link href="#savollar" className="rounded-lg px-3 py-2 transition hover:bg-white hover:text-foreground">
            Savollar
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/auth/login"
            className="hidden min-h-10 items-center rounded-lg px-3 text-sm font-black text-muted-foreground transition hover:text-foreground sm:flex"
          >
            Kirish
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-black text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            Bozor
            <Search className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="container py-5 sm:py-8">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(20rem,0.56fr)]">
        <div className="flex min-w-0 flex-col justify-between gap-8 rounded-xl border border-border bg-white p-4 shadow-card sm:p-7">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Pill icon={Bot}>Telegram-first bozor</Pill>
              <Pill>eFootball uchun maxsus</Pill>
            </div>

            <p className="text-sm font-black uppercase tracking-normal text-primary">
              eFootball akkount bozori
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.05] tracking-normal text-foreground sm:text-5xl lg:text-6xl">
              Diviziyon, kuch, tanga — bittasi ham yashirin emas.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              efBazaar&apos;da har bir e&apos;lon aniq raqamlar bilan chiqadi: diviziyon darajasi, jamoa
              kuchi, tanga miqdori va narx. Sotuvchi bilan bevosita Telegram&apos;da gaplashasiz —
              oraliqda hech kim yo&apos;q.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/marketplace"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
              >
                Bozorni ko&apos;rish
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/marketplace/new"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-white px-6 text-base font-semibold text-foreground transition hover:bg-muted"
              >
                Akkount joylash
                <UploadCloud className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex min-h-14 items-center gap-3 rounded-lg border border-input bg-muted/60 px-3">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-sm font-bold text-muted-foreground">
                Messi Epic, Diviziyon 1, 3100+ kuch
              </span>
              <Filter className="ml-auto h-5 w-5 shrink-0 text-primary" />
            </div>
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_FILTERS.map((filter) => (
                <span
                  key={filter}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-black text-muted-foreground shadow-card"
                >
                  {filter}
                </span>
              ))}
            </div>
          </div>
        </div>

        <AccountShowcase />
      </div>
    </section>
  );
}

function AccountShowcase() {
  return (
    <aside className="relative overflow-hidden rounded-xl border border-border bg-white p-3 shadow-card">
      <span className="absolute -right-14 top-4 z-10 w-36 rotate-45 bg-secondary py-1 text-center text-[9px] font-black uppercase tracking-wider text-secondary-foreground">
        Namuna
      </span>

      <div className="relative overflow-hidden rounded-lg bg-primary p-5 text-primary-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:repeating-linear-gradient(115deg,#fff_0px,#fff_2px,transparent_2px,transparent_18px)]"
        />

        <div className="relative flex items-start justify-between gap-4 pr-8">
          <div>
            <p className="text-xs font-black uppercase text-primary-foreground/70">Namuna e&apos;lon</p>
            <h2 className="mt-1 text-xl font-black">D1 · Google ulangan</h2>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-black">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
            </span>
            Onlayn
          </span>
        </div>

        <div className="relative mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-primary-foreground/70">Jamoa kuchi</p>
            <p className="text-6xl font-black leading-none">{SHOWCASE_LISTING.strength}</p>
          </div>
          <div className="rounded-lg bg-white/15 px-3 py-2 text-right">
            <p className="text-xs font-black uppercase text-primary-foreground/70">Narx</p>
            <p className="text-xl font-black">{SHOWCASE_LISTING.price}</p>
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap gap-2">
          {SHOWCASE_LISTING.players.map((player) => (
            <span key={player} className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
              {player}
            </span>
          ))}
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-2 text-center text-xs font-bold">
          <div className="rounded-lg bg-white/10 px-2 py-2">{SHOWCASE_LISTING.coins} tanga</div>
          <div className="rounded-lg bg-white/10 px-2 py-2">Google ✓</div>
          <div className="rounded-lg bg-white/10 px-2 py-2">Savdolashish</div>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-muted/40 py-3 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="flex w-max animate-marquee gap-2 motion-reduce:animate-none">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, index) => (
            <span
              key={`${item}-${index}`}
              aria-hidden={index >= TICKER_ITEMS.length}
              className="shrink-0 whitespace-nowrap rounded-full border border-border bg-white px-3 py-1.5 text-xs font-bold text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <TinyAction icon={Heart} label="Layklar" value="128" />
        <TinyAction icon={ShoppingBag} label="Savatda" value="42" />
      </div>
    </aside>
  );
}

function DivisionLadder() {
  return (
    <section className="container pb-5 sm:pb-8">
      <div className="rounded-xl border border-border bg-white p-5 shadow-card sm:p-7">
        <p className="text-sm font-black uppercase text-primary">Diviziyon zinapoyasi</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-black leading-tight text-foreground sm:text-3xl">
          Diviziyon 1 dan 9 gacha — har biri uchun xaridor bor.
        </h2>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
          eFootball&apos;da Diviziyon 1 eng yuqori daraja hisoblanadi. Past diviziyondagi arzon starter
          akkountlardan tortib, Diviziyon 1&apos;dagi elite jamoalargacha — barchasi bitta bozorda.
        </p>

        <div className="mt-6 flex flex-wrap items-end gap-2 sm:gap-3">
          {DIVISIONS.map((division) => {
            const isTop = division === 1;
            return (
              <div key={division} className="flex flex-col items-center gap-2">
                <div
                  className={
                    isTop
                      ? 'grid h-14 w-14 place-items-center rounded-lg bg-primary text-lg font-black text-primary-foreground shadow-sm sm:h-16 sm:w-16 sm:text-xl'
                      : 'grid h-11 w-11 place-items-center rounded-lg border border-border bg-muted/60 text-sm font-black text-muted-foreground sm:h-12 sm:w-12'
                  }
                >
                  {isTop ? <Star className="h-5 w-5" /> : division}
                </div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground">D{division}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-between text-xs font-bold text-muted-foreground">
          <span>Boshlang&apos;ich</span>
          <span>Eng yuqori</span>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="qanday-ishlaydi" className="container py-10 sm:py-14">
      <div className="mb-6 max-w-2xl">
        <p className="text-sm font-black uppercase text-primary">Qanday ishlaydi</p>
        <h2 className="mt-3 text-3xl font-black leading-tight text-foreground sm:text-4xl">
          Uch qadam — xaridor uchun ham, sotuvchi uchun ham.
        </h2>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <StepTimeline title="Xaridor uchun" steps={BUYER_STEPS} />
        <StepTimeline title="Sotuvchi uchun" steps={SELLER_STEPS} />
      </div>
    </section>
  );
}

function StepTimeline({
  title,
  steps,
}: {
  title: string;
  steps: Array<{ title: string; body: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-card sm:p-6">
      <h3 className="text-lg font-black text-foreground">{title}</h3>
      <ol className="mt-5 space-y-5">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-4 pl-0">
            <div className="flex flex-col items-center">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              {index < steps.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
            </div>
            <div className="pb-1">
              <h4 className="font-black text-foreground">{step.title}</h4>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TrustGrid() {
  return (
    <section className="container pb-10 sm:pb-14">
      <div className="rounded-xl border border-border bg-accent/40 p-5 sm:p-8">
        <p className="text-sm font-black uppercase text-primary">Nega aynan efBazaar</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-black leading-tight text-foreground sm:text-3xl">
          Hozir ishlayotgan narsalarga qurilgan, va'da emas.
        </h2>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {TRUST_POINTS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border border-border bg-white p-4 shadow-card">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-black text-foreground">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="savollar" className="container pb-10 sm:pb-14">
      <div className="grid gap-4 lg:grid-cols-[0.7fr_1fr]">
        <div>
          <p className="text-sm font-black uppercase text-primary">Savollar</p>
          <h2 className="mt-3 max-w-xl text-3xl font-black leading-tight text-foreground sm:text-4xl">
            Tez-tez so&apos;raladigan savollar.
          </h2>
          <p className="mt-3 max-w-md leading-7 text-muted-foreground">
            Boshqa savolingiz bo&apos;lsa, Telegram bot orqali yozib qoldiring.
          </p>
        </div>

        <div className="divide-y divide-border rounded-xl border border-border bg-white shadow-card">
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="group px-4 py-4 sm:px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold text-foreground">
                {item.question}
                <ArrowRight className="h-4 w-4 shrink-0 rotate-90 text-primary transition-transform group-open:rotate-[270deg]" />
              </summary>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="container pb-12 sm:pb-16">
      <div className="grid gap-5 rounded-xl border border-border bg-white p-5 shadow-card sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-sm font-black uppercase text-primary">Boshlash</p>
          <h2 className="mt-2 text-3xl font-black text-foreground sm:text-4xl">
            Bozor ochiq. Birinchi qadam sizdan.
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            Xaridor bo&apos;lsangiz — bozorni ko&apos;ring. Sotuvchi bo&apos;lsangiz — bir necha
            daqiqada e&apos;lon joylang.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/marketplace"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            Bozorni ko&apos;rish
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={siteConfig.links.telegram}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-white px-6 text-base font-semibold text-foreground transition hover:bg-muted"
          >
            Telegram botni ochish
            <Bot className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function TinyAction({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-black text-foreground">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" />
      </div>
    </div>
  );
}

function Pill({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs font-black text-muted-foreground">
      {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
      {children}
    </span>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border py-8">
      <div className="container flex flex-col gap-4 text-sm font-bold text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="font-black text-foreground">efBazaar</Link>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/marketplace" className="transition hover:text-foreground">
            Bozor
          </Link>
          <Link href="/marketplace/new" className="transition hover:text-foreground">
            Akkount joylash
          </Link>
          <Link href="/auth/login" className="transition hover:text-foreground">
            Kirish
          </Link>
          <Link href={siteConfig.links.telegram} className="transition hover:text-foreground">
            Telegram
          </Link>
        </div>
      </div>
    </footer>
  );
}
