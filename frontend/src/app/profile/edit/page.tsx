import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, Fingerprint, ShieldAlert, ShieldCheck, User } from 'lucide-react';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { DeleteAccountButton } from '@/components/profile/delete-account-button';
import { GoogleLinkButton } from '@/components/profile/google-link-button';
import { LinkTelegramButton } from '@/components/profile/link-telegram-button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Profil sozlamalari',
  robots: { index: false, follow: false },
};

export default async function ProfileEditPage() {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/profile/edit');

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'EfBazaarBot';

  const initials = (user.displayName || 'U')
    .split(' ')
    .map((chunk) => chunk[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <MarketplaceShell
      user={user}
      activeTab="profile"
      hideSearch
      hideHeader
    >
      <div className="space-y-3 pb-32 min-h-[calc(100dvh-8rem)] flex flex-col">
        {/* Mobile App Sticky Top Header */}
        <div className="-mx-4 -mt-4 sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:mt-0 sm:rounded-2xl sm:border sm:px-5 sm:shadow-xs">
          <div className="flex items-center gap-3">
            <Link
              href="/profile"
              aria-label="Profilga qaytish"
              className="grid h-9 w-9 place-items-center rounded-full bg-muted/60 text-foreground transition hover:bg-muted active:scale-90"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-base font-bold text-foreground leading-none">
                Profil sozlamalari
              </h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Shaxsiy ma'lumotlar va xavfsizlik
              </p>
            </div>
          </div>
        </div>

        {/* 1. Identity Overview Card */}
        <div className="-mx-4 border-b border-border/60 bg-card p-5 sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative">
              <Avatar className="h-20 w-20 ring-4 ring-border/80 shadow-sm">
                {user.telegramPhotoUrl && (
                  <AvatarImage src={user.telegramPhotoUrl} alt={user.displayName} />
                )}
                <AvatarFallback className="text-2xl font-black bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>

            <div className="space-y-0.5">
              <h2 className="text-lg font-bold text-foreground">{user.displayName}</h2>
              {user.telegramUsername && (
                <p className="text-sm font-medium text-muted-foreground">
                  @{user.telegramUsername}
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground max-w-sm">
              Profil rasmi va ismingiz Telegram yoki Google hisobingiz orqali avtomatik yangilanadi.
            </p>
          </div>
        </div>

        {/* 2. Connected Accounts / Verification */}
        <Card className="rounded-2xl border-border/80 shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Ulangan hisoblar
            </CardTitle>
            <CardDescription className="text-xs">
              Tasdiqlangan foydalanuvchi maqomini olish uchun Google va Telegram hisoblaringizni ulang.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
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

        {/* 3. Danger Zone: Delete Account */}
        <Card className="rounded-2xl border-destructive/40 bg-destructive/5 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Akkountni o'chirish
            </CardTitle>
            <CardDescription className="text-xs text-destructive/80">
              Akkountingizni o'chirsangiz barcha ma'lumotlar, e'lonlar va chatlar qayta tiklanmaydi.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <DeleteAccountButton />
          </CardContent>
        </Card>
      </div>
    </MarketplaceShell>
  );
}
