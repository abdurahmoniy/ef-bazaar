import { BadgeCheck, ShieldAlert, User as UserIcon } from 'lucide-react';

import { DeleteAccountButton } from '@/components/profile/delete-account-button';
import { GoogleLinkButton } from '@/components/profile/google-link-button';
import { LinkTelegramButton } from '@/components/profile/link-telegram-button';
import { TradeAdminApplicationPanel } from '@/components/profile/trade-admin-application-panel';
import { FEATURES } from '@/lib/feature-flags';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { TradeAdminApplicationResponse } from '@/lib/trade-admin-applications';
import { isTradeAdmin } from '@/lib/trade-human';
import type { User } from '@/lib/types';

interface ProfileAccountProps {
  user: User;
  googleClientId: string;
  botUsername: string;
  tradeAdminApplication: TradeAdminApplicationResponse | null;
}

export function ProfileAccount({
  user,
  googleClientId,
  botUsername,
  tradeAdminApplication,
}: ProfileAccountProps) {
  const defaultContact = user.telegramUsername ? `@${user.telegramUsername}` : user.email ?? '';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BadgeCheck className="h-5 w-5 text-primary" />
            Akkount tasdiqlash
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user.verified && (
            <p className="text-sm text-muted-foreground">
              Tasdiqlangan belgi olish uchun{' '}
              <span className="font-semibold text-foreground">Telegram va Google</span> ikkalasini ham ulang.
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserIcon className="h-5 w-5 text-secondary" />
            Identifikatorlar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
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

      {/* Applying to become a trade admin is pointless while the role has
          nowhere to work — FEATURES.humanAdmin closes the workspace too. */}
      {FEATURES.humanAdmin && (
        <TradeAdminApplicationPanel
          application={tradeAdminApplication}
          isTradeAdmin={isTradeAdmin(user)}
          defaultContact={defaultContact}
        />
      )}

      <Card className="border-destructive/30 lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Xavfli zona
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Akkountingizni o'chirsangiz — barcha e'lonlar, chatlar va ma'lumotlar ham o'chadi. Bu qadamni bekor qilib bo'lmaydi.
          </p>
          <DeleteAccountButton />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'break-all font-mono text-xs' : ''}>{value}</span>
    </div>
  );
}
