import Link from 'next/link';
import {
  BadgeCheck,
  CalendarDays,
  Heart,
  Mail,
  MessageCircle,
  Package,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { isAdmin } from '@/lib/admin';
import type { User } from '@/lib/types';

interface ProfileStats {
  listings: number;
  favorites: number;
  chats: number;
}

interface ProfileHeaderProps {
  user: User;
  stats?: ProfileStats;
}

export function ProfileHeader({ user, stats }: ProfileHeaderProps) {
  const initials = (user.displayName || 'U')
    .split(' ')
    .map((chunk) => chunk[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const memberSince = new Date(user.createdAt);
  const memberSinceLabel = Number.isNaN(memberSince.getTime())
    ? '—'
    : new Intl.DateTimeFormat('uz-UZ', { year: 'numeric', month: 'long' }).format(memberSince);

  return (
    <Card className="overflow-hidden">
      <div className="relative h-20 bg-gradient-to-r from-primary via-primary to-[hsl(174_65%_24%)] sm:h-24">
        <div className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:16px_16px]" />
      </div>

      <div className="px-4 pb-4 sm:px-6 sm:pb-5">
        <div className="flex items-end justify-between gap-3">
          <Avatar className="-mt-10 h-20 w-20 ring-4 ring-card sm:-mt-12 sm:h-24 sm:w-24">
            {user.telegramPhotoUrl && <AvatarImage src={user.telegramPhotoUrl} alt={user.displayName} />}
            <AvatarFallback className="text-2xl font-black">{initials}</AvatarFallback>
          </Avatar>
          {isAdmin(user) && (
            <Link
              href="/admin"
              className="mb-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-muted"
            >
              <ShieldCheck className="h-4 w-4 text-primary" />
              Admin panel
            </Link>
          )}
        </div>

        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black text-foreground sm:text-2xl">{user.displayName}</h1>
            {user.verified ? (
              <Badge variant="verified">
                <BadgeCheck className="h-3 w-3" />
                tasdiqlangan
              </Badge>
            ) : (
              <Badge variant="warn">
                <ShieldAlert className="h-3 w-3" />
                tasdiqlanmagan
              </Badge>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {user.telegramUsername && (
              <span className="inline-flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" />
                @{user.telegramUsername}
              </span>
            )}
            {user.email && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{user.email}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              A&apos;zo: {memberSinceLabel}
            </span>
          </div>
        </div>

        {stats && (
          <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-surface-alt">
            <StatCell icon={<Package className="h-4 w-4" />} value={stats.listings} label="E'lon" />
            <StatCell icon={<Heart className="h-4 w-4" />} value={stats.favorites} label="Sevimli" />
            <StatCell
              icon={<MessageCircle className="h-4 w-4" />}
              value={stats.chats}
              label="Chat"
              href="/chats"
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function StatCell({
  icon,
  value,
  label,
  href,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-base font-black text-foreground">{value}</span>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
    </>
  );
  const className = 'flex items-center justify-center gap-1.5 px-2 py-2.5';

  if (href) {
    return (
      <Link href={href} className={`${className} rounded-r-xl transition hover:bg-accent`}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
}
