import React from 'react';
import { Instagram } from 'lucide-react';
import { siteConfig } from '@/lib/site';
import { cn } from '@/lib/utils';

export function TelegramIcon({ className = 'h-4 w-4', ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.37.75-.56 2.93-1.27 4.88-2.11 5.86-2.52 2.79-1.16 3.37-1.36 3.75-1.37.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .29z" />
    </svg>
  );
}

export function InstagramIcon({ className = 'h-4 w-4', ...props }: { className?: string } & React.ComponentProps<typeof Instagram>) {
  return <Instagram className={className} aria-hidden="true" {...props} />;
}

export interface SocialLinkItem {
  name: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  colorClass?: string;
}

export const SOCIAL_LINKS: readonly SocialLinkItem[] = [
  {
    name: 'Telegram Kanal',
    href: siteConfig.links.telegramChannel,
    label: 'efBazaar rasmiy Telegram kanali',
    icon: <TelegramIcon className="h-4 w-4 text-[#24A1DE]" />,
    colorClass: 'hover:border-[#24A1DE]/40 hover:bg-[#24A1DE]/10 hover:text-[#24A1DE]',
  },
  {
    name: 'Telegram Bot',
    href: siteConfig.links.telegram,
    label: 'efBazaar Telegram boti',
    icon: <TelegramIcon className="h-4 w-4 text-[#229ED9]" />,
    colorClass: 'hover:border-[#229ED9]/40 hover:bg-[#229ED9]/10 hover:text-[#229ED9]',
  },
  {
    name: 'Instagram',
    href: siteConfig.links.instagram,
    label: 'efBazaar rasmiy Instagram sahifasi',
    icon: <InstagramIcon className="h-4 w-4 text-[#E1306C]" />,
    colorClass: 'hover:border-[#E1306C]/40 hover:bg-[#E1306C]/10 hover:text-[#E1306C]',
  },
];

interface SocialLinksRowProps {
  className?: string;
  iconSize?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
}

export function SocialLinksRow({
  className,
  iconSize = 'md',
  showLabels = false,
}: SocialLinksRowProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-9 w-9',
    lg: 'h-10 w-10',
  }[iconSize];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {SOCIAL_LINKS.map((item) => (
        <a
          key={item.name}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={item.label}
          title={item.name}
          className={cn(
            'inline-flex items-center justify-center rounded-xl border border-border bg-card text-foreground transition-all duration-200 active:scale-95 shadow-2xs',
            showLabels ? 'h-9 px-3 gap-2 text-xs font-semibold' : sizeClasses,
            item.colorClass
          )}
        >
          {item.icon}
          {showLabels && <span>{item.name}</span>}
        </a>
      ))}
    </div>
  );
}
