import Link from 'next/link';

import { BrandMark } from '@/components/brand/brand-mark';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  className?: string;
}

const sizes = {
  sm: { chip: 'h-8 w-8', icon: 'h-4 w-4', text: 'text-base' },
  md: { chip: 'h-10 w-10', icon: 'h-5 w-5', text: 'text-xl' },
  lg: { chip: 'h-14 w-14', icon: 'h-7 w-7', text: 'text-3xl' },
};

export function Logo({ size = 'md', href = '/', className }: LogoProps) {
  const s = sizes[size];
  const content = (
    <div className={cn('inline-flex items-center gap-2.5 font-black tracking-normal', s.text, className)}>
      <span className={cn('grid shrink-0 place-items-center rounded-[28%] bg-primary text-primary-foreground', s.chip)}>
        <BrandMark className={s.icon} />
      </span>
      <span>
        <span className="text-foreground">eF</span>
        <span className="text-primary">Bazaar</span>
      </span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block transition-opacity hover:opacity-80" aria-label="eFBazaar bosh sahifa">
        {content}
      </Link>
    );
  }
  return content;
}
