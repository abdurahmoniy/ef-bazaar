import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Apple,
  ArrowRight,
  BadgeCheck,
  Bot,
  Clock3,
  Coins,
  Filter,
  Heart,
  MessageCircle,
  RefreshCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react';

import { AuthAwareLink } from '@/components/auth/auth-aware-link';
import { Logo } from '@/components/brand/logo';
import { SiteFooter } from '@/components/site-footer';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { MARKETPLACE_LANDINGS } from '@/lib/marketplace-landing';
import { absoluteUrl, siteConfig } from '@/lib/site';

const FAQ_ITEMS = [
  {
    question: "Akkountni qaysi o'yinchilar bo'yicha izlash mumkin?",
    answer:
      "Bozorda har bir e'longa sotuvchi o'zining yulduz kartalarini biriktiradi — Messi, Ronaldo, Mbappe va boshqalar. Xaridor \"Yulduz o'yinchi\" filtridan kartani tanlaydi — asosiy karta turlari Epic, Big Time va Show Time bo'yicha qidiruv ishlaydi.",
  },
  {
    question: "Diviziyon qanday hisoblanadi — D1 yuqorimi yoki D4?",
    answer:
      "eFootball'da Diviziyon 1 eng yuqori daraja. Bozorda 4 daraja badge'i ishlatiladi: D1, D2, D3 va D4+ (D4 va undan past hammasi bir belgi ostida).",
  },
  {
    question: "Android va iOS akkountlar bir joydami?",
    answer:
      "Ha. Har bir e'londa akkount Google Play (Android) yoki Game Center (iOS) ga ulangani ko'rsatiladi. Android va iOS tangalari alohida ko'rsatiladi — o'zingizga mos platformani filtrdan tanlaysiz.",
  },
  {
    question: "Obmen (almashtirish) qilish mumkinmi?",
    answer:
      "Ha. Sotuvchi e'lon shartlarida \"Faqat obmen\", \"Obmen + doplata\" yoki \"Sotuv yoki obmen\" ni belgilashi mumkin. Xaridor esa faqat obmen tayyor e'lonlarni ko'rish uchun filtr qo'llaydi.",
  },
  {
    question: "To'lovni qanday amalga oshiraman?",
    answer:
      "eFBazaar to'lovni o'z ichiga olmaydi — narx va to'lov usulini sotuvchi bilan chat orqali kelishasiz. Login-parolini esa faqat kelishuv yakunida, ishonchli xaridoringizga bering.",
  },
  {
    question: "Sotuvchiga yozgan xabarim qancha turadi?",
    answer:
      "Sotuvchi bilan chat 24 soat davom etadi — shu vaqt ichida javob bo'lmasa, avtomatik yopiladi. Kelishuv jiddiy bo'lsa, chatni \"Muhim\" deb belgilab, saqlab qolasiz.",
  },
  {
    question: "Akkount ma'lumotlarim xavfsizmi?",
    answer:
      "Platformadagi barcha amallar — layk, savatga qo'shish, chat ochish — tasdiqlangan sessiyangiz orqali sizning nomingizdan amalga oshiriladi. Akkountning login-paroli DB'da saqlanmaydi, uni faqat siz sotuvchi sifatida xaridoringizga topshirasiz.",
  },
];

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteConfig.url}/#organization`,
      name: siteConfig.name,
      url: siteConfig.url,
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl('/brand-icon/512'),
        width: 512,
        height: 512,
      },
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
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${siteConfig.url}/marketplace?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
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
    {
      '@type': 'FAQPage',
      '@id': `${siteConfig.url}/#faq`,
      mainEntity: FAQ_ITEMS.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    },
  ],
};

const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c');

const ACCOUNT_FILTERS = ['Messi Epic', 'Diviziyon 1', '3100+ kuch', 'Google Play', 'Obmen bor'];

const SHOWCASE_LISTING = {
  division: 1,
  strength: 3150,
  price: "450 000 so'm",
  androidCoins: '8 400',
  iosCoins: '1 200',
  players: [
    { name: 'Messi', type: 'Epic', rating: 99 },
    { name: 'Mbappe', type: 'Big Time', rating: 97 },
    { name: 'Ronaldo', type: 'Show Time', rating: 96 },
  ],
};

const TICKER_ITEMS = [
  "D1 · Messi Epic · 450 000 so'm",
  "D2 · Ronaldo Big Time · 380 000 so'm",
  "D1 · Mbappe Show Time · 620 000 so'm",
  "D3 · Neymar Epic · 210 000 so'm",
  "D1 · Obmen + doplata · 700 000 so'm",
  "D4+ · Starter · 95 000 so'm",
  "D2 · Vinicius Show Time · 340 000 so'm",
  "D1 · Haaland Big Time · 550 000 so'm",
];

const DIVISIONS: { level: 1 | 2 | 3 | 4; label: string; caption: string }[] = [
  { level: 4, label: 'D4+', caption: 'Boshlang‘ich' },
  { level: 3, label: 'D3', caption: 'O‘rta' },
  { level: 2, label: 'D2', caption: 'Yuqori' },
  { level: 1, label: 'D1', caption: 'Eng yuqori' },
];

const CARD_TYPES = [
  {
    type: 'Epic',
    gist: "Legendalarning eng kuchli maxsus versiyalari — kolleksiyaning cho'qqisi.",
    example: 'Messi Epic · 99',
  },
  {
    type: 'Big Time',
    gist: "Yuqori reytingli maxsus versiyalar — jamoaning asosiy yulduzlari.",
    example: 'Mbappe Big Time · 97',
  },
  {
    type: 'Show Time',
    gist: "Yorqin chiqishlar uchun beriladigan effektli maxsus kartalar.",
    example: 'Ronaldo Show Time · 96',
  },
];

const EXCHANGE_MODES = [
  {
    key: 'sale',
    icon: Coins,
    title: 'Faqat sotuv',
    body: "Belgilangan narx. Sotuvchi savdolashishga tayyor bo'lsa, e'londa \"Savdolashish\" belgisi turadi.",
  },
  {
    key: 'exchange',
    icon: RefreshCcw,
    title: 'Faqat obmen',
    body: "Naqd pul yo'q — akkountga akkount. Sotuvchi qanaqa akkount izlashini tavsifda aytadi.",
  },
  {
    key: 'exchange_plus',
    icon: Sparkles,
    title: 'Obmen + doplata',
    body: "Akkountingiz + qo'shimcha to'lov bilan almashinuv. Bir tomonlama zaif akkount uchun ham yechim.",
  },
];

const BUYER_STEPS = [
  {
    title: "Yulduz karta bo'yicha filtrlang",
    body: "Messi Epic, Ronaldo Show Time, Mbappe Big Time — \"Yulduz o'yinchi\" filtridan kartani tanlab, mos akkountni soniyalarda toping.",
  },
  {
    title: "Diviziyon, kuch va tangalarni solishtiring",
    body: "Har bir e'londa D1–D4+ badge, jamoa kuchi (1000–5000), Android/iOS tangalari va platforma aniq ko'rsatilgan.",
  },
  {
    title: "Sotuvchiga to'g'ridan-to'g'ri yozing",
    body: '"Egasi bilan bog\'lanish" tugmasi orqali chat oching — 24 soat ichida javobsiz qolmaydi. Xohlasangiz obmen ham taklif qilasiz.',
  },
];

const SELLER_STEPS = [
  {
    title: "Telegram orqali kiring",
    body: "Bir bosishda ro'yxatdan o'tasiz — parol o'ylab topish shart emas. Google ulasangiz tasdiqlangan belgisini olasiz.",
  },
  {
    title: "Yulduz kartalaringizni biriktiring",
    body: "Diviziyon, kuch, Android/iOS tanga miqdori, platformalar va Epic/Big Time o'yinchilaringizni tanlab, rasmlarni yuklang.",
  },
  {
    title: "Sotuv yoki obmen shartini tanlang",
    body: "Narx qo'yasizmi, obmenmi yoki ikkalasi — o'zingiz belgilaysiz. Layk va chat so'rovlari real vaqtda profilingizga tushadi.",
  },
];

const TRUST_POINTS = [
  {
    icon: Sparkles,
    title: "Kartalar birinchi o'rinda",
    body: "Har bir e'londa Epic, Big Time, Show Time yulduzlar aniq biriktirilgan — hech kim \"eng kuchli akkount\" degan quruq va'da bilan ishonchingizni sinamaydi.",
  },
  {
    icon: RefreshCcw,
    title: 'Sotuv va obmen — bitta bozorda',
    body: "Naqd pulda sotasizmi, akkountga akkount obmen qilasizmi yoki obmen + doplata — hammasi bitta filtr ostida.",
  },
  {
    icon: Smartphone,
    title: 'Android va iOS alohida',
    body: "Google Play va Game Center ulanmalari va tanga miqdorlari alohida ko'rsatiladi. Faqat o'zingizga mos platformani filtrlaysiz.",
  },
  {
    icon: ShieldCheck,
    title: 'Har bir amal serverda tekshiriladi',
    body: "Layk, savat, chat — barchasi tasdiqlangan sessiya orqali. Login-parol platformada saqlanmaydi, faqat siz o'z xaridoringizga topshirasiz.",
  },
  {
    icon: Bot,
    title: 'Telegram-first',
    body: "Bir bosishda Telegram orqali kirasiz. Bot bilan yangi e'lonlar haqida darhol xabar olasiz.",
  },
  {
    icon: Clock3,
    title: '24 soatlik chat oynasi',
    body: 'Sotuvchi bilan chat 24 soatdan keyin avtomatik yopiladi. Muhim kelishuvni "Muhim" deb belgilab saqlab qolasiz.',
  },
];

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <main className="min-h-app overflow-hidden bg-background pt-[env(safe-area-inset-top)] text-foreground">
        <LandingHeader />
        <Hero />
        <StarPlayers />
        <PlatformSplit />
        <ExchangeModes />
        <DivisionLadder />
        <HowItWorks />
        <TrustGrid />
        <PopularCategories />
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
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-card sm:px-4">
        <Logo size="sm" href="/" />

        <nav className="hidden items-center gap-1 rounded-lg bg-muted p-1 text-sm font-bold text-muted-foreground lg:flex">
          <Link href="/marketplace" className="rounded-lg px-3 py-2 transition hover:bg-card hover:text-foreground">
            Bozor
          </Link>
          <Link href="/tournaments" className="rounded-lg px-3 py-2 transition hover:bg-card hover:text-foreground">
            Turnirlar
          </Link>
          <Link href="#yulduzlar" className="rounded-lg px-3 py-2 transition hover:bg-card hover:text-foreground">
            Kartalar
          </Link>
          <Link href="#obmen" className="rounded-lg px-3 py-2 transition hover:bg-card hover:text-foreground">
            Obmen
          </Link>
          <Link href="#qanday-ishlaydi" className="rounded-lg px-3 py-2 transition hover:bg-card hover:text-foreground">
            Qanday ishlaydi
          </Link>
          <Link href="#savollar" className="rounded-lg px-3 py-2 transition hover:bg-card hover:text-foreground">
            Savollar
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <AuthAwareLink
            anonHref="/auth/login"
            anonLabel="Kirish"
            authHref="/profile"
            authLabel="Profil"
            className="hidden min-h-10 items-center rounded-lg px-3 text-sm font-black text-muted-foreground transition hover:text-foreground sm:flex"
          />
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
        <div className="flex min-w-0 flex-col justify-between gap-6 rounded-xl border border-border bg-card p-4 shadow-card sm:gap-8 sm:p-7">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2 sm:mb-5">
              <Pill icon={Bot}>Telegram-first bozor</Pill>
              {/* Second pill wraps to its own line on a phone and pushes the
                  headline below the fold — desktop only. */}
              <span className="hidden sm:contents">
                <Pill>eFootball uchun maxsus</Pill>
              </span>
            </div>

            <p className="text-xs font-black uppercase tracking-normal text-primary sm:text-sm">
              eFootball akkount bozori · O&apos;zbekiston
            </p>
            <h1 className="mt-2 max-w-3xl text-3xl font-black leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-5xl sm:leading-[1.05] lg:text-6xl">
              Qaysi yulduzni izlayapsiz? Kartaga qarab akkountni toping.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:mt-5 sm:text-lg sm:leading-8">
              Messi Epic, Mbappe Big Time, Ronaldo Show Time — har bir e&apos;longa yulduz kartalar
              biriktirilgan. Diviziyon, jamoa kuchi, Android/iOS tangalari va obmen shartlari filtrda
              ochiq. Sotuvchi bilan bevosita Telegram&apos;da gaplashasiz — oraliqda hech kim yo&apos;q.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:mt-7 sm:flex-row">
              <Link
                href="/marketplace"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
              >
                Bozorni ko&apos;rish
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/marketplace/new"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 text-base font-semibold text-foreground transition hover:bg-muted"
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
                Messi Epic · D1 · 3100+ kuch · Google Play
              </span>
              <Filter className="ml-auto h-5 w-5 shrink-0 text-primary" />
            </div>
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_FILTERS.map((filter) => (
                <span
                  key={filter}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-black text-muted-foreground shadow-card"
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
    <aside className="relative overflow-hidden rounded-xl border border-border bg-card p-3 shadow-card">
      <span className="absolute -right-14 top-4 z-10 w-36 rotate-45 bg-secondary py-1 text-center text-[9px] font-black uppercase tracking-wider text-secondary-foreground">
        Namuna
      </span>

      <div className="relative overflow-hidden rounded-lg bg-primary p-5 text-primary-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:repeating-linear-gradient(115deg,#fff_0px,#fff_2px,transparent_2px,transparent_18px)]"
        />

        <div className="relative flex items-center justify-between gap-3 pr-8">
          <p className="text-xs font-black uppercase text-primary-foreground/70">Namuna e&apos;lon</p>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-black">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
            </span>
            Onlayn
          </span>
        </div>

        <div className="relative mt-3 flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/15 ring-1 ring-white/25">
            <Image
              src="/badges/division-1.png"
              alt="Division 1 badge"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
          </span>
          <h2 className="text-lg font-black sm:text-xl">D1 · Google Play</h2>
        </div>

        <div className="relative mt-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase text-primary-foreground/70">Jamoa kuchi</p>
            <p className="text-5xl font-black leading-none sm:text-6xl">{SHOWCASE_LISTING.strength}</p>
          </div>
          <div className="rounded-lg bg-white/15 px-2.5 py-2 text-right sm:px-3">
            <p className="text-xs font-black uppercase text-primary-foreground/70">Narx</p>
            <p className="text-base font-black sm:text-xl">{SHOWCASE_LISTING.price}</p>
          </div>
        </div>

        <div className="relative mt-5">
          <p className="text-[10px] font-black uppercase text-primary-foreground/70">
            Yulduz o&apos;yinchilar
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SHOWCASE_LISTING.players.map((player) => (
              <span
                key={player.name}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold"
              >
                {player.name}
                <span className="rounded bg-white/20 px-1 py-[1px] text-[9px] font-black uppercase tracking-wide">
                  {player.type}
                </span>
                <span className="text-[10px] font-black text-primary-foreground/85">
                  {player.rating}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-2 text-center text-xs font-bold">
          <div className="rounded-lg bg-white/10 px-2 py-2">
            <p className="text-[10px] uppercase text-primary-foreground/70">Android</p>
            <p className="mt-0.5 text-sm font-black">{SHOWCASE_LISTING.androidCoins}</p>
          </div>
          <div className="rounded-lg bg-white/10 px-2 py-2">
            <p className="text-[10px] uppercase text-primary-foreground/70">iOS</p>
            <p className="mt-0.5 text-sm font-black">{SHOWCASE_LISTING.iosCoins}</p>
          </div>
          <div className="rounded-lg bg-white/10 px-2 py-2">
            <p className="text-[10px] uppercase text-primary-foreground/70">Shart</p>
            <p className="mt-0.5 text-sm font-black">Obmen ✓</p>
          </div>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-muted/40 py-3 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="flex w-max animate-marquee gap-2 motion-reduce:animate-none">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, index) => (
            <span
              key={`${item}-${index}`}
              aria-hidden={index >= TICKER_ITEMS.length}
              className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <TinyAction icon={Heart} label="Layklar" value="128" />
        <TinyAction icon={MessageCircle} label="Chatlar" value="42" />
      </div>
    </aside>
  );
}

function StarPlayers() {
  return (
    <section id="yulduzlar" className="container pb-5 sm:pb-8">
      <div className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase text-primary">Yulduz o&apos;yinchilar</p>
            <h2 className="mt-2 text-2xl font-black leading-tight text-foreground sm:text-3xl">
              Asosiy karta turlari: Epic, Big Time, Show Time.
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              eFootball&apos;da akkountning haqiqiy qiymatini uning yulduz kartalari belgilaydi.
              Sotuvchi 12 tagacha kartani biriktiradi — nomi, karta turi va reytingi bilan. Siz esa
              bozordagi &quot;Yulduz o&apos;yinchi&quot; filtridan kartani tanlab, aynan shu karta bor
              akkountlarni bir soniyada topasiz.
            </p>
          </div>
          <Link
            href="/marketplace"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-black text-foreground shadow-card transition hover:bg-muted sm:w-auto"
          >
            Karta bo&apos;yicha filtrlash
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {CARD_TYPES.map(({ type, gist, example }) => (
            <div
              key={type}
              className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-4 transition hover:border-primary/40 hover:bg-card"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground">
                  {type}
                </span>
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{gist}</p>
              <span className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold text-foreground">
                <Search className="h-3 w-3 text-primary" />
                {example}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformSplit() {
  return (
    <section className="container pb-5 sm:pb-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <PlatformCard
          icon={Smartphone}
          heading="Android · Google Play"
          bullet1="Google Play ulanmasi e'londa ko'rsatiladi."
          bullet2="Android tanga miqdori alohida ko'rinadi."
          bullet3="Tasdiqlangan Google ulanmasi — profilingizga badge beradi."
        />
        <PlatformCard
          icon={Apple}
          heading="iOS · Game Center"
          bullet1="Game Center ulanmasi e'londa ko'rsatiladi."
          bullet2="iOS tanga miqdori alohida ko'rinadi — Android bilan aralashmaydi."
          bullet3="Filtrdan faqat iOS akkountlarni ko'rish uchun tanlash mumkin."
        />
      </div>
    </section>
  );
}

function PlatformCard({
  icon: Icon,
  heading,
  bullet1,
  bullet2,
  bullet3,
}: {
  icon: LucideIcon;
  heading: string;
  bullet1: string;
  bullet2: string;
  bullet3: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-lg font-black text-foreground">{heading}</h3>
      </div>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
        <li className="flex gap-2">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{bullet1}</span>
        </li>
        <li className="flex gap-2">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{bullet2}</span>
        </li>
        <li className="flex gap-2">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{bullet3}</span>
        </li>
      </ul>
    </div>
  );
}

function ExchangeModes() {
  return (
    <section id="obmen" className="container pb-5 sm:pb-8">
      <div className="rounded-xl border border-border bg-accent/40 p-5 shadow-card sm:p-7">
        <p className="text-sm font-black uppercase text-primary">Sotuv, obmen, ikkalasi</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-black leading-tight text-foreground sm:text-3xl">
          Naqd pul, obmen yoki obmen + doplata — bitta bozorda.
        </h2>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
          O&apos;zbekistondagi eFootball hamjamiyatida akkountlar tez-tez akkountga almashtiriladi.
          eFBazaar buni birinchi darajali holat sifatida qo&apos;llab-quvvatlaydi — sotuvchi shartlarni,
          xaridor filtrni tanlaydi.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {EXCHANGE_MODES.map(({ key, icon: Icon, title, body }) => (
            <div key={key} className="rounded-lg border border-border bg-card p-4 shadow-card">
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

function DivisionLadder() {
  return (
    <section className="container pb-5 sm:pb-8">
      <div className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-7">
        <p className="text-sm font-black uppercase text-primary">Diviziyon darajalari</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-black leading-tight text-foreground sm:text-3xl">
          D1&apos;dan D4+&apos;gacha — har biri uchun o&apos;z xaridori bor.
        </h2>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
          eFootball&apos;da Diviziyon 1 eng yuqori daraja. eFBazaar 4 rasmiy badge&apos;dan foydalanadi:
          D1, D2, D3 va D4+ — D4 va undan past hammasi bir badge ostida. Boshlang&apos;ich starter
          akkountdan tortib elite D1 jamoasigacha — hammasi bitta filtrda.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
          {DIVISIONS.map(({ level, label, caption }) => (
            <div key={level} className="flex flex-col items-center gap-2">
              <div
                className={
                  level === 1
                    ? 'grid aspect-square w-full max-w-24 place-items-center rounded-xl bg-primary/5 p-2 ring-2 ring-primary'
                    : 'grid aspect-square w-full max-w-24 place-items-center rounded-xl border border-border bg-muted/40 p-2'
                }
              >
                <Image
                  src={`/badges/division-${level}.png`}
                  alt={`Division ${label} badge`}
                  width={80}
                  height={80}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-black text-foreground">{label}</p>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">{caption}</p>
              </div>
            </div>
          ))}
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
        <h2 className="mt-3 text-2xl font-black leading-tight text-foreground sm:text-4xl">
          Uch qadamda gol — xaridor uchun ham, sotuvchi uchun ham.
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
    <div className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-6">
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
        <p className="text-sm font-black uppercase text-primary">Nega aynan eFBazaar</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-black leading-tight text-foreground sm:text-3xl">
          O&apos;yin qoidalari oldindan aniq — syurprizsiz savdo.
        </h2>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST_POINTS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border border-border bg-card p-4 shadow-card">
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

function PopularCategories() {
  return (
    <section className="container pb-10 sm:pb-14">
      <div className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-7">
        <p className="text-sm font-black uppercase text-primary">Kategoriyalar</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-black leading-tight text-foreground sm:text-3xl">
          Qidirganingizni to&apos;g&apos;ridan-to&apos;g&apos;ri oching.
        </h2>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
          Divizion, platforma yoki yulduz karta bo&apos;yicha tayyor sahifalar — har birida shu
          kategoriyaga mos e&apos;lonlar jamlangan.
        </p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {MARKETPLACE_LANDINGS.map((entry) => (
            <li key={entry.slug}>
              <Link
                href={`/akkountlar/${entry.slug}`}
                className="inline-flex min-h-10 items-center rounded-full border border-border bg-muted/40 px-4 text-sm font-bold text-foreground transition hover:border-primary hover:text-primary"
              >
                {entry.label}
              </Link>
            </li>
          ))}
        </ul>
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
          <h2 className="mt-3 max-w-xl text-2xl font-black leading-tight text-foreground sm:text-4xl">
            Tez-tez so&apos;raladigan savollar.
          </h2>
          <p className="mt-3 max-w-md leading-7 text-muted-foreground">
            Boshqa savolingiz bo&apos;lsa, Telegram bot orqali yozib qoldiring.
          </p>
        </div>

        <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-card">
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
      <div className="grid gap-5 rounded-xl border border-border bg-card p-5 shadow-card sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-sm font-black uppercase text-primary">Boshlash</p>
          <h2 className="mt-2 text-2xl font-black text-foreground sm:text-4xl">
            Transfer oynasi yopilmaydi. Birinchi qadam sizdan.
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
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 text-base font-semibold text-foreground transition hover:bg-muted"
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
    <div className="rounded-xl border border-border bg-card p-3 shadow-card">
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

