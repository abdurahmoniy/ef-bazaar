import Link from 'next/link';
import { Gamepad2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  className?: string;
}

const sizes = {
  sm: { icon: 'h-5 w-5', text: 'text-base' },
  md: { icon: 'h-6 w-6', text: 'text-xl' },
  lg: { icon: 'h-8 w-8', text: 'text-3xl' },
};

export function Logo({ size = 'md', href = '/', className }: LogoProps) {
  const s = sizes[size];
  const content = (
    <div className={cn('inline-flex items-center gap-2 font-bold tracking-normal', s.text, className)}>
      <span className="relative inline-flex items-center justify-center">
        <span className="absolute inset-0 rounded-md bg-gradient-to-br from-cyber-cyan to-emerald-400 opacity-50 blur-md" />
        <Gamepad2 className={cn('relative text-foreground', s.icon)} />
      </span>
      <span>
        <span className="text-foreground">ef</span>
        <span className="text-gradient">Bazaar</span>
      </span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block transition-opacity hover:opacity-80">
        {content}
      </Link>
    );
  }
  return content;
}
