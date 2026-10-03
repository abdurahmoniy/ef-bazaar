'use client';

import { useEffect, useId, useReducer, useRef, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Loader2, Send, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  cancelLogin, resendCode, startLogin, submitCode, submitPassword, UserbotApiError,
} from '@/lib/userbot-client';
import { initialLogin, loginReducer, resendSecondsLeft, type LoginStep } from '@/lib/userbot-login-flow';
import type { LoginStepResponse } from '@/lib/userbot-types';
import { codeDestination, formatCountdown, handleLine, initials, sanitizeCode } from '@/lib/userbot-view';

interface UserbotLoginDialogProps {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}

const STEPS: LoginStep[] = ['phone', 'code', 'password', 'done'];
const PHONE_DEFAULT = '+998 ';

export function UserbotLoginDialog({ open, onClose, onConnected }: UserbotLoginDialogProps) {
  const [state, dispatch] = useReducer(loginReducer, initialLogin);
  const [phone, setPhone] = useState(PHONE_DEFAULT);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const { step, busy, error } = state;
  const phoneId = useId();
  const passwordId = useId();

  // Bumped whenever the login is abandoned; a request that resolves under an older
  // generation belongs to a dead login and must not touch the dialog.
  const generation = useRef(0);
  const loginIdRef = useRef<string | null>(null);
  useEffect(() => {
    loginIdRef.current = state.loginId;
  });
  useEffect(() => () => {
    generation.current += 1;
    if (loginIdRef.current) cancelLogin(loginIdRef.current).catch(() => {});
  }, []);

  const abandon = () => {
    generation.current += 1;
    if (loginIdRef.current) cancelLogin(loginIdRef.current).catch(() => {});
    loginIdRef.current = null;
  };

  const clear = () => {
    setCode('');
    setPassword('');
    setShowPassword(false);
    setPhone(PHONE_DEFAULT);
  };

  const close = () => {
    const connected = step === 'done';
    if (connected) {
      generation.current += 1;
      loginIdRef.current = null;
    } else {
      abandon();
    }
    clear();
    dispatch({ type: 'reset' });
    if (connected) onConnected();
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!open || step !== 'code') return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open, step]);

  if (!open) return null;

  const run = async (op: 'start' | 'submit' | 'resend', req: () => Promise<LoginStepResponse>) => {
    const gen = generation.current;
    dispatch({ type: 'submit' });
    try {
      const res = await req();
      if (gen !== generation.current) {
        if (res.loginId && res.status !== 'DONE') cancelLogin(res.loginId).catch(() => {});
        return;
      }
      dispatch({ type: 'response', res, now: Date.now() });
      setCode('');
      setPassword('');
    } catch (e) {
      if (gen !== generation.current) return;
      const error = e instanceof UserbotApiError
        ? { code: e.code, message: e.message }
        : { code: 'NETWORK', message: "Tarmoq xatosi. Qayta urinib ko'ring." };
      const action = { type: 'failure', op, error } as const;
      // The reducer starting over means the server still holds this login: release it.
      if (state.loginId && loginReducer(state, action).loginId === null) {
        cancelLogin(state.loginId).catch(() => {});
        loginIdRef.current = null;
      }
      dispatch(action);
      setCode('');
      setPassword('');
    }
  };

  const back = () => {
    abandon();
    clear();
    dispatch({ type: 'back' });
  };

  const finish = () => {
    generation.current += 1;
    loginIdRef.current = null;
    clear();
    dispatch({ type: 'reset' });
    onConnected();
    onClose();
  };

  const secondsLeft = resendSecondsLeft(state, now);
  const stepIndex = STEPS.indexOf(step);
  const loginId = state.loginId ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="userbot-login-title"
        className="relative w-full max-w-[440px] rounded-3xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <button
          type="button"
          aria-label="Yopish"
          onClick={close}
          className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="mb-6 flex gap-1.5 pr-10" aria-hidden="true">
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Send className="h-6 w-6" aria-hidden="true" />
        </div>

        {step === 'phone' && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => { e.preventDefault(); void run('start', () => startLogin(phone.trim())); }}
          >
            <div>
              <h2 id="userbot-login-title" className="text-xl font-bold">Telegram&apos;ga kirish</h2>
              <p className="mt-1 text-sm text-muted-foreground">Userbot sifatida ulanadigan akkountning telefon raqamini kiriting.</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-input bg-card px-4 py-3 text-sm text-foreground">
              <span className="text-muted-foreground">Mamlakat</span>
              <span className="font-medium">O&apos;zbekiston +998</span>
            </div>
            <label htmlFor={phoneId} className="-mb-2 text-sm font-medium">Telefon raqam</label>
            <Input
              id={phoneId}
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
            />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy || phone.replace(/\D/g, '').length < 9}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              Kodni yuborish
            </Button>
          </form>
        )}

        {step === 'code' && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => { e.preventDefault(); if (code.length >= 5) void run('submit', () => submitCode(loginId, code)); }}
          >
            <div>
              <h2 id="userbot-login-title" className="text-xl font-bold">{phone.trim()}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Kodni shu akkount ochiq turgan {codeDestination(state.codeType)} yubordik.
              </p>
              <button
                type="button"
                onClick={back}
                disabled={busy}
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Raqamni o&apos;zgartirish
              </button>
            </div>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Tasdiqlash kodi"
              className="text-center text-2xl tracking-[0.6em]"
              value={code}
              onChange={(e) => setCode(sanitizeCode(e.target.value))}
              disabled={busy}
              autoFocus
            />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {secondsLeft > 0 ? (
              <p className="text-sm text-muted-foreground">Qayta yuborish {formatCountdown(secondsLeft)} dan keyin</p>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run('resend', () => resendCode(loginId))}
                className="self-start text-sm font-medium text-primary hover:underline disabled:opacity-50"
              >
                Kodni qayta yuborish
              </button>
            )}
            <Button type="submit" disabled={busy || code.length < 5}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              Davom etish
            </Button>
          </form>
        )}

        {step === 'password' && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => { e.preventDefault(); if (password) void run('submit', () => submitPassword(loginId, password)); }}
          >
            <div>
              <h2 id="userbot-login-title" className="text-xl font-bold">Ikki bosqichli parol</h2>
              <p className="mt-1 text-sm text-muted-foreground">Akkountda qo&apos;shimcha parol yoqilgan. Uni kiriting.</p>
            </div>
            <label htmlFor={passwordId} className="-mb-2 text-sm font-medium">Parol</label>
            <div className="relative">
              <Input
                id={passwordId}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                autoFocus
              />
              <button
                type="button"
                aria-label={showPassword ? 'Parolni yashirish' : "Parolni ko'rsatish"}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground hover:bg-muted"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            {state.hint && <p className="text-sm text-muted-foreground">Eslatma: {state.hint}</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy || !password}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              Kirish
            </Button>
          </form>
        )}

        {step === 'done' && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 id="userbot-login-title" className="text-xl font-bold">Userbot ulandi</h2>
              <p className="mt-1 text-sm text-muted-foreground">Bir necha soniyada ishga tushadi. Uni vazifaga &quot;Vazifalar&quot; bo&apos;limidan biriktiring.</p>
            </div>
            {state.account && (
              <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {initials(state.account.firstName, state.account.lastName)}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold">{[state.account.firstName, state.account.lastName].filter(Boolean).join(' ')}</p>
                  <p className="truncate text-sm text-muted-foreground">{handleLine(state.account)}</p>
                </div>
              </div>
            )}
            <Button type="button" onClick={finish} autoFocus>Tayyor</Button>
          </div>
        )}
      </div>
    </div>
  );
}
