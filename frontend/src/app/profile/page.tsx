import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BadgeCheck, ShieldAlert, Send, Mail, User as UserIcon } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Logo } from '@/components/brand/logo';
import { GoogleLinkButton } from '@/components/profile/google-link-button';
import { LinkTelegramButton } from '@/components/profile/link-telegram-button';
import { LogoutButton } from '@/components/profile/logout-button';
import { DeleteAccountButton } from '@/components/profile/delete-account-button';
import { getMe } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Profil',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ProfilePage() {
  const user = await getMe();
  if (!user) redirect('/auth/login');

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'EfBazaarBot';
  const initials = (user.displayName || 'U')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="container flex items-center justify-between py-6">
        <Logo size="md" />
        <LogoutButton />
      </header>

      <main className="container max-w-3xl pb-12 space-y-6">
        {/* Profile header card */}
        <Card>
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <Avatar className="h-24 w-24 ring-4 ring-cyber-cyan/20">
                {user.telegramPhotoUrl && <AvatarImage src={user.telegramPhotoUrl} alt={user.displayName} />}
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold">{user.displayName}</h1>
                  {user.verified ? (
                    <Badge variant="verified">
                      <BadgeCheck className="h-3 w-3" />
                      verified
                    </Badge>
                  ) : (
                    <Badge variant="warn">
                      <ShieldAlert className="h-3 w-3" />
                      tasdiqlanmagan
                    </Badge>
                  )}
                </div>

                {user.telegramUsername && (
                  <p className="text-muted-foreground text-sm mt-1">@{user.telegramUsername}</p>
                )}

                <div className="flex flex-wrap gap-2 mt-3">
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
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account verification */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-cyber-cyan" />
              Akkount tasdiqlash
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!user.verified && (
              <p className="text-sm text-muted-foreground">
                Verified badge olish uchun ikkalasi ham ulanishi shart —{' '}
                <span className="text-foreground font-medium">Telegram va Google</span>.
              </p>
            )}
            <GoogleLinkButton
              googleClientId={googleClientId}
              alreadyLinked={user.googleLinked}
              email={user.email}
            />
            <LinkTelegramButton
              botUsername={botUsername}
              alreadyLinked={user.telegramLinked}
              telegramUsername={user.telegramUsername}
            />
          </CardContent>
        </Card>

        {/* Identity info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-cyber-purple" />
              Identifikatorlar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {user.telegramId != null && (
              <>
                <Row label="Telegram ID" value={String(user.telegramId)} mono />
                <Separator />
              </>
            )}
            <Row label="User ID" value={user.id} mono />
            <Separator />
            <Row label="Ro'llar" value={user.roles?.join(', ') || '—'} />
            <Separator />
            <Row label="Ro'yxatdan o'tgan" value={new Date(user.createdAt).toLocaleString('uz-UZ')} />
          </CardContent>
        </Card>

        {/* Danger zone */}
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Xavfli zona
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DeleteAccountButton />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs' : ''}>{value}</span>
    </div>
  );
}
