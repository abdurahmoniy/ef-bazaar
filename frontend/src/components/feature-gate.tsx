import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

import { type FeatureKey, isFeatureEnabled } from '@/lib/feature-flags';

interface FeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
}

/**
 * Server component that gates content behind a feature flag.
 * When the feature is disabled, renders a polished "coming soon" page
 * instead of the children.
 */
export function FeatureGate({ feature, children }: FeatureGateProps) {
  if (isFeatureEnabled(feature)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="h-8 w-8" />
      </span>
      <h1 className="mt-6 text-2xl font-black text-foreground sm:text-3xl">
        Tez kunda!
      </h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
        Bu funksiya hozirda ishlab chiqilmoqda. Tez orada hammasi tayyor bo'ladi!
      </p>
      <Link
        href="/marketplace"
        className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
      >
        Bozorga qaytish
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
