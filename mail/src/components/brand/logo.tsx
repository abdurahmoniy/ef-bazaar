import { BrandMark } from '@/components/brand/brand-mark';
import { MAIN_SITE_URL } from '@/lib/site';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: { chip: 'h-8 w-8', icon: 'h-4 w-4', text: 'text-base' },
  md: { chip: 'h-10 w-10', icon: 'h-5 w-5', text: 'text-xl' },
  lg: { chip: 'h-14 w-14', icon: 'h-7 w-7', text: 'text-3xl' },
};

/**
 * Mirror of frontend/src/components/brand/logo.tsx with the "Pochta"
 * sub-brand appended. Always a plain <a> to the marketplace: this app is a
 * different origin, so next/link prefetching would be pointless.
 */
export function Logo({ size = 'sm', className }: LogoProps) {
  const s = sizes[size];

  return (
    <a
      href={MAIN_SITE_URL}
      aria-label="eFBazaar bosh sahifa"
      className="inline-block min-w-0 transition-opacity hover:opacity-80"
    >
      <span
        className={cn(
          'inline-flex min-w-0 items-center gap-2.5 font-black tracking-normal',
          s.text,
          className,
        )}
      >
        <span
          className={cn(
            'grid shrink-0 place-items-center rounded-[28%] bg-primary text-primary-foreground',
            s.chip,
          )}
        >
          <BrandMark className={s.icon} />
        </span>
        <span className="truncate">
          <span className="text-foreground">eF</span>
          <span className="text-primary">Bazaar</span>
          <span className="ml-1.5 text-sm font-semibold text-muted-foreground">Pochta</span>
        </span>
      </span>
    </a>
  );
}
