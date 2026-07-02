import * as React from 'react';

import { cn } from '@/lib/utils';

export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('skeleton', className)} {...props} />
  ),
);
Skeleton.displayName = 'Skeleton';
