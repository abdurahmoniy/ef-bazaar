import type { Metadata } from 'next';
import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { BackLink } from '@/components/navigation/back-link';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import styles from './auth.module.css';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`min-h-app ${styles.shell}`}>
      <a href="#auth-main" className={styles.skipLink}>Asosiy mazmunga o‘tish</a>
      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.headerInner}`}>
          <Logo size="sm" />
          <div className={styles.headerActions}>
            <BackLink href="/" label="Orqaga" />
            <ThemeToggle className={styles.themeToggle} />
          </div>
        </div>
      </header>

      <main id="auth-main" tabIndex={-1} className={`${styles.wrap} ${styles.main}`}>
        {children}
      </main>

      <footer className={`${styles.wrap} ${styles.footer}`}>
        <p>© {new Date().getFullYear()} eFBazaar</p>
        <nav aria-label="Kirish bo‘yicha yordam">
          <Link href="/marketplace">Bozorni ko‘rish</Link>
          <Link href="/help">Yordam</Link>
        </nav>
      </footer>
    </div>
  );
}
