'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  HelpCircle,
  Info,
  Lightbulb,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type TipCalloutVariant = 'tip' | 'info' | 'security' | 'warning' | 'guide';

interface TipCalloutProps {
  title?: string;
  children?: React.ReactNode;
  variant?: TipCalloutVariant;
  dismissible?: boolean;
  dismissKey?: string;
  learnMoreHref?: string;
  learnMoreLabel?: string;
  className?: string;
  icon?: LucideIcon;
}

const VARIANT_CONFIG: Record<
  TipCalloutVariant,
  {
    icon: LucideIcon;
    containerClass: string;
    iconBgClass: string;
    iconColorClass: string;
    badgeClass: string;
    badgeText: string;
  }
> = {
  tip: {
    icon: Lightbulb,
    containerClass:
      'border-primary/20 bg-primary/5 text-foreground dark:border-primary/30 dark:bg-primary/10',
    iconBgClass: 'bg-primary/15 text-primary',
    iconColorClass: 'text-primary',
    badgeClass: 'bg-primary/15 text-primary',
    badgeText: 'Maslahat',
  },
  info: {
    icon: Info,
    containerClass:
      'border-blue-500/20 bg-blue-500/5 text-foreground dark:border-blue-500/30 dark:bg-blue-500/10',
    iconBgClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    iconColorClass: 'text-blue-600 dark:text-blue-400',
    badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    badgeText: 'Ma‘lumot',
  },
  security: {
    icon: ShieldCheck,
    containerClass:
      'border-emerald-500/25 bg-emerald-500/5 text-foreground dark:border-emerald-500/30 dark:bg-emerald-500/10',
    iconBgClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    iconColorClass: 'text-emerald-600 dark:text-emerald-400',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    badgeText: 'Xavfsizlik',
  },
  warning: {
    icon: AlertTriangle,
    containerClass:
      'border-amber-500/25 bg-amber-500/5 text-foreground dark:border-amber-500/30 dark:bg-amber-500/10',
    iconBgClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    iconColorClass: 'text-amber-600 dark:text-amber-400',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    badgeText: 'Diqqat',
  },
  guide: {
    icon: HelpCircle,
    containerClass:
      'border-border bg-card text-foreground shadow-sm',
    iconBgClass: 'bg-muted text-foreground',
    iconColorClass: 'text-primary',
    badgeClass: 'bg-muted text-muted-foreground',
    badgeText: 'Qo‘llanma',
  },
};

export function TipCallout({
  title,
  children,
  variant = 'tip',
  dismissible = false,
  dismissKey,
  learnMoreHref,
  learnMoreLabel = 'Batafsil',
  className,
  icon: CustomIcon,
}: TipCalloutProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (!dismissible || !dismissKey || typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(`tip_dismissed_${dismissKey}`) === 'true';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (dismissKey && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`tip_dismissed_${dismissKey}`, 'true');
      } catch {
        // Ignore localStorage write failures
      }
    }
  };

  const config = VARIANT_CONFIG[variant];
  const Icon = CustomIcon || config.icon;

  return (
    <div
      role="note"
      className={cn(
        'relative flex items-start gap-3 rounded-xl border p-3.5 text-xs sm:p-4 sm:text-sm',
        config.containerClass,
        className
      )}
    >
      <div
        className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:h-8 sm:w-8',
          config.iconBgClass
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {title ? (
            <h4 className="text-xs font-black text-foreground sm:text-sm">{title}</h4>
          ) : (
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider',
                config.badgeClass
              )}
            >
              {config.badgeText}
            </span>
          )}
        </div>

        <div className="mt-1 text-muted-foreground leading-relaxed">{children}</div>

        {learnMoreHref && (
          <div className="mt-2">
            <Link
              href={learnMoreHref}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              {learnMoreLabel} →
            </Link>
          </div>
        )}
      </div>

      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Yopish"
          className="ml-auto -mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
