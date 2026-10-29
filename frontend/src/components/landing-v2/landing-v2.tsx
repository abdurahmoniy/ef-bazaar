import { ArrowRight, ArrowUpRight, Check, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { AuthAwareLink } from '@/components/auth/auth-aware-link';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { SlidingNav } from '@/components/navigation/sliding-nav';
import { buttonVariants } from '@/components/ui/button';
import { buildListingSearchParams } from '@/lib/marketplace-format';
import { siteConfig } from '@/lib/site';

import styles from './landing-v2.module.css';
import type { ReactNode } from 'react';

const NAV_ITEMS = [
  { id: 'marketplace', href: '/marketplace', label: 'Bozor' },
  { id: 'how', href: '#qanday-ishlaydi', label: 'Qanday ishlaydi' },
  { id: 'help', href: '/help', label: 'Yordam' },
];

const PLAYERS = [
  { name: 'Gullit', filter: 'Ruud Gullit' },
  { name: 'Ronaldo', filter: 'Cristiano Ronaldo' },
  { name: 'Messi', filter: 'Lionel Messi' },
  { name: 'Rummenigge', filter: 'Karl-Heinz Rummenigge' },
  { name: 'Vieira', filter: 'Patrick Vieira' },
];

const STEPS = [
  { minute: '0', title: 'Topish', text: 'Yulduz karta, diviziyon, jamoa kuchi va platforma bo‘yicha filtrlang.' },
  { minute: '45', title: 'Kelishish', text: 'Narx yoki obmen shartini sotuvchi bilan to‘g‘ridan-to‘g‘ri chatda muhokama qiling.' },
  { minute: '90', title: 'Topshirish', text: 'Mobile uchun Smart Admin bilan Garov bitimi. Steam va PlayStation uchun admin yordami.' },
];

const PRINCIPLES = [
  { title: 'Kartalar birinchi o‘rinda', text: 'Har bir e’londa Epic, Big Time, Show Time yulduzlar aniq biriktirilgan.' },
  { title: 'Sotuv va obmen', text: 'Naqd pul, akkountga akkount yoki obmen + doplata — hammasi bitta filtr ostida.' },
  { title: 'Android va iOS alohida', text: 'Google Play va Game Center ulanmalari hamda tanga miqdorlari alohida ko‘rsatiladi.' },
  { title: 'Komissiya oldindan ko‘rinadi', text: 'Narx belgilashda xizmat haqi va qo‘lingizga tegadigan sof summa ko‘rsatiladi.' },
  { title: 'Telegram-first', text: 'Bir bosishda Telegram orqali kirasiz, bot yangi e’lonlar haqida xabar beradi.' },
];

export function LandingV2({ welcome }: { welcome?: ReactNode } = {}) {
  return (
    <div className={styles.landing}>
      <a className={styles.skipLink} href="#landing-v2-main">Asosiy mazmunga o‘tish</a>
      <header className="sticky top-0 z-40 border-b border-border surface-nav pt-[var(--app-content-safe-top)]">
        <div className={`${styles.wrap} ${styles.header}`}>
          <Logo size="sm" />
          <SlidingNav items={NAV_ITEMS} variant="underline" ariaLabel="Asosiy navigatsiya" className={`mx-0 px-0 ${styles.navigation}`} />
          <div className={styles.headerActions}>
            <ThemeToggle className={`h-9 w-9 rounded-full ${styles.themeToggle}`} />
            <AuthAwareLink anonHref="/auth/login" anonLabel="Kirish" authHref="/profile" authLabel="Profil" icon={<UserRound aria-hidden="true" className="h-4 w-4" />} className={buttonVariants({size:'sm',className:`h-9 rounded-full px-3 lg:px-4 ${styles.login}`})} />
          </div>
        </div>
      </header>

      <main id="landing-v2-main" tabIndex={-1}>
        {welcome}
        <section className={styles.hero} aria-labelledby="landing-v2-title">
          <div className={styles.poster} aria-hidden="true">
            <div className={styles.posterColor}>
              <Image src="/landing-v2/legends.png" alt="" fill priority sizes="(max-width: 760px) 100vw, 58vw" className={styles.posterImage} />
              <div className={styles.halftone} />
            </div>
          </div>
          <div className={`${styles.wrap} ${styles.heroContent}`}>
            <p className={styles.location}><span />O‘zbekiston · eFootball akkount bozori</p>
            <h1 id="landing-v2-title" className={styles.heroTitle}>Akkount emas — <span>yulduz</span> qidiring.</h1>
            <p className={styles.heroIntro}>Epic, Big Time, Show Time kartalari bo‘yicha toping, shartni chatda kelishing. Mobile savdosi Garov (Escrow) bilan himoyalanadi.</p>
            <div className={styles.heroActions}>
              <Link href="/marketplace" className={`${styles.button} ${styles.primaryButton}`}>Bozorni ko‘rish <ArrowUpRight size={20} aria-hidden="true" /></Link>
              <Link href="/marketplace/new" className={styles.textLink}>Akkount joylash <ArrowRight size={17} aria-hidden="true" /></Link>
            </div>
            <div className={styles.smartAdmin}>
              <p className={styles.smartLabel}><ShieldCheck size={19} aria-hidden="true" />Avtomatik Garov xizmati</p>
              <p className={styles.smartTitle}>Endi admin javobini <span>kutmaysiz.</span></p>
              <p className={styles.smartDescription}>Mobile savdosida Smart Admin o‘rtada turadi: mablag‘ Garovda saqlanadi, akkount bosqichma-bosqich topshiriladi.</p>
              <a href="#garov" className={styles.smartLink}>Garov qanday ishlaydi <ArrowRight size={16} aria-hidden="true" /></a>
            </div>
          </div>
          <a href="#garov" className={styles.stamp} aria-label="Smart Admin Garov himoyasi haqida">
            <ShieldCheck size={23} aria-hidden="true" />
            <strong>Garov</strong><span>himoyasi</span>
          </a>
        </section>

        <section className={styles.players} aria-labelledby="players-title">
          <div className={`${styles.wrap} ${styles.sectionLabel}`}><h2 id="players-title">Yulduzni tanlang</h2><span>Akkountlar</span></div>
          <nav aria-label="Yulduz kartalar">
            {PLAYERS.map((player, index) => (
              <Link key={player.name} href={`/marketplace?${buildListingSearchParams({ attributes: { valuable_players_name: player.filter } })}`} className={styles.playerRow}>
                <span className={styles.playerNumber}>0{index + 1}</span>
                <span className={styles.playerName}>{player.name}</span>
                <span className={styles.playerCaption}>Barcha kartalar</span>
                <ArrowUpRight className={styles.playerArrow} aria-hidden="true" />
              </Link>
            ))}
          </nav>
          <Link href="/marketplace" className={styles.allListings}><span>Barcha e’lonlarni ko‘rish</span><ArrowRight size={25} aria-hidden="true" /></Link>
        </section>

        <section id="qanday-ishlaydi" className={`${styles.wrap} ${styles.steps}`} aria-labelledby="steps-title">
          <h2 id="steps-title" className={styles.sectionTitle}>Uch qadam.<br />Bitta o‘yin.</h2>
          <ol className={styles.stepList}>
            {STEPS.map((step) => (
              <li key={step.minute}>
                <div className={styles.minute}>{step.minute}<span>′</span></div>
                <h3>{step.title}</h3><p>{step.text}</p>
              </li>
            ))}
          </ol>
          <p className={styles.sellerNote}>Sotuvchimisiz? Telegram orqali bir bosishda kiring, kartalaringizni biriktiring. Komissiya va sof summa narx belgilashda oldindan ko‘rinadi. <Link href="/marketplace/new">Akkount joylash <ArrowUpRight size={15} aria-hidden="true" /></Link></p>
        </section>

        <section id="garov" className={`${styles.wrap} ${styles.escrow}`} aria-labelledby="escrow-title">
          <div>
            <h2 id="escrow-title" className={styles.sectionTitle}>Pul akkount topshirilguncha <span>muzlatiladi.</span></h2>
            <p className={styles.escrowIntro}>Mobile bitimlarida xaridor mablag‘i Garovda saqlanadi. Bitim yakunlangach, komissiyadan qolgan summa sotuvchiga o‘tadi.</p>
          </div>
          <div className={styles.escrowDiagram}>
            <div className={styles.escrowFlow} aria-label="Xaridordan Garov orqali sotuvchiga">
              <div><span className={styles.flowPill}>Xaridor</span><p>Mablag‘<br />muzlaydi</p></div>
              <ArrowRight className={styles.flowArrow} size={20} aria-hidden="true" />
              <div><span className={`${styles.flowPill} ${styles.flowActive}`}><LockKeyhole size={17} aria-hidden="true" />Garov</span><p>Akkount<br />topshiriladi</p></div>
              <ArrowRight className={styles.flowArrow} size={20} aria-hidden="true" />
              <div><span className={styles.flowPill}>Sotuvchi</span><p>Sof summa<br />o‘tadi</p></div>
            </div>
            <p className={styles.escrowNote}><ShieldCheck size={18} aria-hidden="true" /><span>Steam va PlayStation savdolarida admin yordam beradi.</span></p>
            <Link href="/help" className={styles.textLink}>Garov haqida batafsil <ArrowUpRight size={17} aria-hidden="true" /></Link>
          </div>
        </section>

        <section className={`${styles.wrap} ${styles.principles}`} aria-labelledby="principles-title">
          <h2 id="principles-title" className={styles.principlesTitle}>Qoidalar oldindan aniq.</h2>
          <dl>
            {PRINCIPLES.map((item) => (
              <div key={item.title}><dt><Check size={19} aria-hidden="true" />{item.title}</dt><dd>{item.text}</dd></div>
            ))}
          </dl>
        </section>

        <section className={`${styles.wrap} ${styles.finalCta}`} aria-labelledby="cta-title">
          <h2 id="cta-title">Transfer oynasi <span>yopilmaydi.</span></h2>
          <div className={styles.finalActions}>
            <Link href="/marketplace" className={`${styles.button} ${styles.primaryButton}`}>Bozorni ko‘rish <ArrowUpRight size={20} aria-hidden="true" /></Link>
            <a href={siteConfig.links.telegramBot} className={`${styles.button} ${styles.outlineButton}`}>Telegram botni ochish <ArrowUpRight size={19} aria-hidden="true" /></a>
          </div>
          <Link className={styles.sellLink} href="/marketplace/new">Akkount joylash</Link>
        </section>
      </main>

      <footer className={`${styles.wrap} ${styles.footer}`}>
        <div><Logo size="sm" className="font-sans" /><p>© {new Date().getFullYear()} eFBazaar</p></div>
        <nav aria-label="Qo‘shimcha havolalar">
          <Link href="/help">Yordam</Link><Link href="/invite">Do‘st taklif qilish</Link><Link href="/partnership">Telegram kanal egalari uchun</Link>
          <a href={siteConfig.links.telegramChannel}>Telegram <ArrowUpRight size={13} aria-hidden="true" /></a><a href={siteConfig.links.instagram}>Instagram <ArrowUpRight size={13} aria-hidden="true" /></a>
        </nav>
      </footer>
    </div>
  );
}
