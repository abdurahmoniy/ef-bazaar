'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

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
}

export function LoginForm({ botUsername, googleClientId, from, initialError = null }: LoginFormProps) {
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

      <div className={styles.telegram} inert={pending} aria-busy={pending}>
        <p className={styles.providerLabel}>Telegram bilan kirish</p>
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
