import { BrandMark } from '@/components/brand/brand-mark';
import { cn } from '@/lib/utils';
import styles from './membership-pass.module.css';

/** Decorative identity only; never grants a capability or verification status. */
export function MembershipPass({ owner = 'Ko‘proq imkoniyat. Sizning o‘yiningiz.', compact = false }: { owner?: string; compact?: boolean }) {
  return (
    <div className={cn(styles.pass, compact && styles.compact)} aria-hidden="true">
      <div className={styles.pitch}><span /></div>
      <div className={styles.brand}><BrandMark /><span>efBazaar</span><span className={styles.edition}>A’ZOLIK</span></div>
      <div className={styles.tier}>Pro<span>O‘yinda bir qadam oldinda.</span></div>
      <div className={styles.owner}><span>{owner}</span><BrandMark /></div>
    </div>
  );
}
