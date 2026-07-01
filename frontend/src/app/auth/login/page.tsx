import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

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
          Telegram yoki Google bilan kiring — birinchi marta kirsangiz avtomatik ro'yxatdan o'tasiz.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <LoginForm botUsername={botUsername} googleClientId={googleClientId} />
      </CardContent>
    </Card>
  );
}
