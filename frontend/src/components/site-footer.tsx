import Link from 'next/link';

import { AuthAwareLink } from '@/components/auth/auth-aware-link';
import {
  LANDING_GROUP_LABELS,
  MARKETPLACE_LANDINGS,
  type MarketplaceLandingGroup,
} from '@/lib/marketplace-landing';
import { siteConfig } from '@/lib/site';
import { cn } from '@/lib/utils';
import { GrowthLink } from '@/components/growth/growth-link';
import { SocialLinksRow } from '@/components/brand/social-icons';

const GROUP_ORDER: readonly MarketplaceLandingGroup[] = ['division', 'platform', 'player'];

interface SiteFooterProps {
  /**
   * Inside MarketplaceShell children already sit in a max-w-6xl padded main —
   * skip the footer's own container so widths line up.
   */
  embedded?: boolean;
}

/**
 * Sitewide footer. The category columns mirror MARKETPLACE_LANDINGS so every
 * page carrying the footer internally links to all SEO landing pages — new
 * landing defs show up here automatically.
 */
export function SiteFooter({ embedded = false }: SiteFooterProps) {
  return (
    <footer className="border-t border-border py-8 sm:py-10">
      <div className={cn(!embedded && 'container')}>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="text-base font-black text-foreground">
              eFBazaar
            </Link>
            <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
              O‘zbekiston uchun eFootball akkountlar bozori. Mobile uchun Garov (Escrow)
              va oldindan ko‘rinadigan komissiya, Steam va PlayStation uchun admin yordami.
            </p>
            <div className="mt-4">
              <SocialLinksRow />
            </div>
          </div>

          <FooterColumn title="Bozor">
            <li>
              <FooterLink href="/marketplace">Barcha e&apos;lonlar</FooterLink>
            </li>
            <li>
              <FooterLink href="/marketplace/new">Akkount joylash</FooterLink>
            </li>
            <li>
              <AuthAwareLink
                anonHref="/auth/login"
                anonLabel="Kirish"
                authHref="/profile"
                authLabel="Profil"
                className="text-sm font-bold text-muted-foreground transition hover:text-foreground"
              />
            </li>
            <li>
              <FooterLink href="/help">Yordam va Qo‘llanma</FooterLink>
            </li>
            <li>
              <GrowthLink href="/invite" event="invite_open" placement="footer" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary dark:text-secondary hover:underline">Do‘st taklif qilish</GrowthLink>
            </li>
            <li>
              <GrowthLink href="/partnership" event="partnership_open" placement="footer" className="inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground hover:text-foreground">Telegram kanal egalari uchun</GrowthLink>
            </li>
            <li>
              <FooterExternalLink href={siteConfig.links.telegramChannel}>Telegram kanal</FooterExternalLink>
            </li>
            <li>
              <FooterExternalLink href={siteConfig.links.telegram}>Telegram bot</FooterExternalLink>
            </li>
            <li>
              <FooterExternalLink href={siteConfig.links.instagram}>Instagram</FooterExternalLink>
            </li>
          </FooterColumn>

          {GROUP_ORDER.map((group) => (
            <FooterColumn key={group} title={LANDING_GROUP_LABELS[group]}>
              {MARKETPLACE_LANDINGS.filter((def) => def.group === group).map((def) => (
                <li key={def.slug}>
                  <FooterLink href={`/akkountlar/${def.slug}`}>{def.label}</FooterLink>
                </li>
              ))}
            </FooterColumn>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-4 sm:flex-row">
          <p className="text-xs font-semibold text-muted-foreground">
            © {new Date().getFullYear()} eFBazaar
          </p>
          <div className="flex sm:hidden">
            <SocialLinksRow iconSize="sm" />
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title}>
      <p className="text-xs font-black uppercase tracking-wide text-foreground">{title}</p>
      <ul className="mt-3 space-y-2">{children}</ul>
    </nav>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm font-bold text-muted-foreground transition hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function FooterExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-bold text-muted-foreground transition hover:text-foreground"
    >
      {children}
    </a>
  );
}
