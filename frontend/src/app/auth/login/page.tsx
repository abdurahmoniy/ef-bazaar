import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMe } from '@/lib/auth';
import { resolveAuthPageUser } from '@/lib/auth-page';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Kirish',
};

export default async function LoginPage() {
  if (await resolveAuthPageUser(getMe)) redirect('/profile');

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'EfBazaarBot';
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Akkountga kirish</CardTitle>
        <CardDescription>
          Telegram orqali kiring. Google ulagan bo'lsangiz, Google bilan ham mumkin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <LoginForm botUsername={botUsername} googleClientId={googleClientId} />

        <p className="text-center text-sm text-muted-foreground">
          Yangi foydalanuvchimisiz?{' '}
          <Link href="/auth/register" className="font-semibold text-primary hover:underline">
            Ro'yxatdan o'tish
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
