import { BadgeCheck, Mail, Send, ShieldAlert } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { User } from '@/lib/types';

interface ProfileHeaderProps {
  user: User;
}

export function ProfileHeader({ user }: ProfileHeaderProps) {
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
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar className="h-20 w-20 ring-4 ring-primary/10 sm:h-24 sm:w-24">
            {user.telegramPhotoUrl && <AvatarImage src={user.telegramPhotoUrl} alt={user.displayName} />}
            <AvatarFallback className="text-2xl font-black">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-foreground">{user.displayName}</h1>
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
            {user.telegramUsername && (
              <p className="mt-1 text-sm text-muted-foreground">@{user.telegramUsername}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {user.telegramLinked && (
                <Badge variant="muted">
                  <Send className="h-3 w-3" />
                  Telegram
                </Badge>
              )}
              {user.email && (
                <Badge variant="muted">
                  <Mail className="h-3 w-3" />
                  {user.email}
                </Badge>
              )}
              <Badge variant="outline">A'zo: {memberSinceLabel}</Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
