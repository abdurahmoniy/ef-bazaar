'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { loadGoogleIdentity, type GoogleIdentity } from './google-identity';

interface GoogleButtonProps {
  clientId: string;
  /** Callback ID token bilan chaqiriladi */
  onCredential: (idToken: string) => void;
  label?: string;
  disabled?: boolean;
}

/**
 * Google Identity Services tugmasi.
 * Bizning custom button — Telegram tugmasi bilan vizual mos ko'rinishi uchun.
 * `prompt()` chaqirilganda One Tap modal ochiladi.
 */
export function GoogleButton({
  clientId,
  onCredential,
  label = 'Google bilan davom etish',
  disabled,
}: GoogleButtonProps) {
  const [state, setState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = React.useState(0);
  const apiRef = React.useRef<GoogleIdentity | null>(null);
  const callbackRef = React.useRef(onCredential);
  callbackRef.current = onCredential;

  React.useEffect(() => {
    let disposed = false;
    apiRef.current = null;
    setState('loading');
    if (!clientId) {
      setState('error');
      return;
    }
    void loadGoogleIdentity().then(api => {
      if (disposed) return;
      api.initialize({
        client_id: clientId,
        callback: response => callbackRef.current(response.credential),
        ux_mode: 'popup',
        auto_select: false,
      });
      apiRef.current = api;
      setState('ready');
    }).catch(() => { if (!disposed) setState('error'); });
    return () => { disposed = true; };
  }, [attempt, clientId]);

  const handleClick = React.useCallback(() => {
    if (state === 'error') {
      setAttempt(value => value + 1);
      return;
    }
    try {
      apiRef.current?.prompt();
    } catch {
      setState('error');
    }
  }, [state]);

  return (
    <>
      {state === 'error' && (
        <p role="alert" className="text-sm text-muted-foreground">
          Google yuklanmadi. Internet aloqasini tekshirib, qayta urinib ko‘ring.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={handleClick}
        disabled={disabled || state === 'loading'}
      >
        <GoogleIcon />
        {state === 'ready' ? label : state === 'error' ? 'Qayta urinish — Google' : 'Google tayyorlanmoqda…'}
      </Button>
    </>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="!h-5 !w-5" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.96h5.5c-.24 1.27-.95 2.35-2.02 3.07v2.55h3.27c1.91-1.76 3.01-4.35 3.01-7.43 0-.71-.06-1.4-.18-2.15H12z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.27-2.55c-.91.61-2.07.97-3.35.97-2.57 0-4.75-1.74-5.53-4.07H3.13v2.62A9.99 9.99 0 0 0 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M6.47 13.92A6.05 6.05 0 0 1 6.15 12c0-.67.11-1.32.32-1.92V7.46H3.13A9.99 9.99 0 0 0 2 12c0 1.62.39 3.15 1.13 4.54l3.34-2.62z"
      />
      <path
        fill="#4285F4"
        d="M12 6.05c1.47 0 2.79.51 3.83 1.5l2.87-2.87C16.96 3.05 14.7 2 12 2A9.99 9.99 0 0 0 3.13 7.46l3.34 2.62C7.25 7.79 9.43 6.05 12 6.05z"
      />
    </svg>
  );
}
