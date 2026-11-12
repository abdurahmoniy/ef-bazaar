'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2, RefreshCw, Send } from 'lucide-react';

import { TelegramLogin } from '@/components/auth/telegram-login';
import { TelegramSwitchHint } from '@/components/auth/telegram-switch-hint';
import { GoogleButton } from '@/components/auth/google-button';
import { Button } from '@/components/ui/button';
import { googleLoginAction, telegramAuthAction } from '@/app/auth/actions';
import { ACCESS_REQUIREMENTS_UNMET, accessRequiredHref } from '@/lib/access-requirements';
import { OFERTA_HREF, PRIVACY_HREF } from '@/lib/legal';
import type { TelegramAuthData } from '@/lib/types';
import styles from '../auth.module.css';

interface LoginFormProps {
  botUsername: string;
  googleClientId: string;
  /** Login'dan keyin qaytish manzili (`?from=` dan) — server action tekshiradi. */
  from?: string;
  initialError?: string | null;
  /** Botga havola (`t.me/<bot>`, kampaniya/referal yuki bilan) — Mini App avtomatik kiradi. */
  telegramAppHref: string;
  /** Telefon yoki ilova ichidagi brauzer — Telegram ilovasi widget'dan oldin taklif qilinadi. */
  preferTelegramApp?: boolean;
}

/**
 * Login Widget o'rniga Telegram ilovasi: bot ochiladi, Mini App esa
 * initData bilan avtomatik kiradi — telefon raqami va tasdiq kerak emas.
 */
function TelegramAppEntry({ href, primary }: { href: string; primary: boolean }) {
  return (
    <div className={styles.appEntry}>
      <a href={href} className={primary ? styles.appEntryPrimary : styles.appEntryLink}>
        <Send aria-hidden="true" />Telegram ilovasida ochish
      </a>
      {primary && <p className={styles.appEntryNote}>Bir bosishda kirasiz — telefon raqam so‘ralmaydi.</p>}
    </div>
  );
}

export function LoginForm({
  botUsername, googleClientId, from, initialError = null, telegramAppHref, preferTelegramApp = false,
}: LoginFormProps) {
  const [error, setError] = React.useState<string | null>(initialError);
  const [pending, setPending] = React.useState(false);
  const [renderIssue, setRenderIssue] = React.useState(false);
  const [widgetAttempt, setWidgetAttempt] = React.useState(0);
  const onRenderIssue = React.useCallback(() => setRenderIssue(true), []);

  const onTelegram = React.useCallback(async (data: TelegramAuthData) => {
    setError(null);
    setPending(true);
    const res = await telegramAuthAction(data, from);
    setPending(false);
    if (!res.ok && res.code === ACCESS_REQUIREMENTS_UNMET) {
      window.location.assign(accessRequiredHref(from));
      return;
    }
    if (!res.ok) setError(res.error ?? 'Telegram auth ishlamadi');
  }, [from]);

  const onGoogle = React.useCallback(async (idToken: string) => {
    setError(null);
    setPending(true);
    const res = await googleLoginAction(idToken, from);
    setPending(false);
    if (!res.ok) setError(res.error ?? 'Google login ishlamadi');
  }, [from]);

  return (
    <div className={styles.form}>
      {error && (
        <div role="alert" className={styles.error}>
          <AlertCircle aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {preferTelegramApp && <TelegramAppEntry href={telegramAppHref} primary />}

      <div className={styles.telegram} inert={pending} aria-busy={pending}>
        <p className={styles.providerLabel}>{preferTelegramApp ? 'Yoki shu brauzerda kirish' : 'Telegram bilan kirish'}</p>
        {renderIssue ? (
          <div className={styles.providerIssue} role="status">
            <p className={styles.issueTitle}>Telegram yuklanmadi</p>
            <p>{googleClientId ? 'Google orqali davom eting yoki qayta urinib ko‘ring.' : 'Qayta urinib ko‘ring yoki yordamga murojaat qiling.'}</p>
            <div className={styles.issueActions}>
              <Button type="button" variant="outline" onClick={() => { setRenderIssue(false); setWidgetAttempt((attempt) => attempt + 1); }}>
                <RefreshCw aria-hidden="true" />Qayta urinish
              </Button>
              <Link href="/help">Yordam</Link>
            </div>
          </div>
        ) : (
          <div className={styles.widget}>
            <TelegramLogin
              key={widgetAttempt}
              botUsername={botUsername}
              size="large"
              cornerRadius={12}
              onAuth={onTelegram}
              onRenderIssue={onRenderIssue}
            />
          </div>
        )}
        {!preferTelegramApp && <TelegramAppEntry href={telegramAppHref} primary={false} />}
      </div>

      {googleClientId && (
        <>
          <div className={styles.divider}><span />yoki<span /></div>

          <GoogleButton
            clientId={googleClientId}
            onCredential={onGoogle}
            label="Google bilan kirish"
            disabled={pending}
          />
        </>
      )}

      {pending && <p role="status" className={styles.pending}><Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Kirilmoqda…</p>}
      <p className={styles.consent}>
        Kirish orqali <Link href={OFERTA_HREF}>ommaviy oferta</Link> va{' '}
        <Link href={PRIVACY_HREF}>maxfiylik siyosati</Link>ga rozilik bildirasiz.
      </p>
      <TelegramSwitchHint />
    </div>
  );
}
