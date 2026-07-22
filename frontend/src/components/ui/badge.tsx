import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-foreground border border-primary/20',
        verified: 'bg-primary text-primary-foreground',
        muted: 'bg-muted text-muted-foreground border border-border',
        warn: 'bg-amber-100 text-amber-800 border border-amber-300',
        price: 'bg-[hsl(var(--price)/0.14)] text-[hsl(var(--price))] border border-[hsl(var(--price)/0.24)]',
        info: 'bg-sky-50 text-sky-700 border border-sky-200',
        danger: 'bg-destructive/10 text-destructive border border-destructive/20',
        outline: 'bg-card text-foreground border border-border',
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
