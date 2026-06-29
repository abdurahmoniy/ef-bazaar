import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-cyber-cyan/15 text-cyber-cyan border border-cyber-cyan/30',
        verified: 'bg-gradient-to-r from-cyber-cyan to-emerald-400 text-slate-950 shadow-glow-cyan',
        muted: 'bg-white/5 text-muted-foreground border border-white/10',
        warn: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
