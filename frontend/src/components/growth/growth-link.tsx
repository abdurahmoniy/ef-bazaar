'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { trackGrowth, type GrowthEvent } from '@/lib/growth-analytics';

type Props = ComponentProps<typeof Link> & { event: GrowthEvent; placement: string };

export function GrowthLink({ event, placement, onClick, ...props }: Props) {
  return <Link {...props} onClick={(e) => {
    onClick?.(e);
    if (!e.defaultPrevented) trackGrowth(event, { placement });
  }} />;
}
