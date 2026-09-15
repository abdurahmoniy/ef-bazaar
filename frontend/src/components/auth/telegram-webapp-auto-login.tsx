'use client';

import * as React from 'react';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { isSafeInternalPath } from '@/lib/safe-redirect';

/**
 * Telegram Mini App initData'ni URL hash'dan to'g'ridan-to'g'ri o'qiydi.
 *
 * Telegram client Mini App URL'ga shu ko'rinishda hash qo'shadi:
 *   #tgWebAppData=user%3D...%26auth_date%3D...%26hash%3D...&tgWebAppVersion=...&tgWebAppPlatform=...
 *
 * `tgWebAppData` qiymati — bu xuddi shu signed initData query-string (URL-decoded).
 * Biz `telegram-web-app.js` skriptidan mustaqil o'qiymiz — skript yuklash CSP yoki
 * tarmoq sababli kechikishi yoki bloklanishi mumkin.
 */
const TELEGRAM_HASH_KEYS = [
  'tgWebAppData',
  'tgWebAppVersion',
  'tgWebAppPlatform',
  'tgWebAppThemeParams',
] as const;
const HYDRATION_INTERVAL_MS = 100;
const HYDRATION_ATTEMPTS = 30;
const LOGIN_TIMEOUT_MS = 15_000;
const SUBMITTED_INIT_DATA_STORAGE_KEY = 'efbazaar.telegramWebAppAutoLogin.submittedInitData';

export function readMiniAppInitData(): string | null {
  if (typeof window === 'undefined') return null;

  const raw = window.location.hash.replace(/^#/, '');
  if (raw) {
    const params = new URLSearchParams(raw);
    const data = params.get('tgWebAppData');
    if (data) return data;
  }

  // Fallback — skript allaqachon yuklangan bo'lsa
  return window.Telegram?.WebApp?.initData || null;
}

function hasTelegramLaunchContext() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return false;
  const params = new URLSearchParams(raw);
  return TELEGRAM_HASH_KEYS.some((key) => params.has(key));
}

function removeTelegramLaunchHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return;
  const params = new URLSearchParams(raw);
  if (!TELEGRAM_HASH_KEYS.some((key) => params.has(key))) return;
  TELEGRAM_HASH_KEYS.forEach((key) => params.delete(key));
  const remaining = params.toString();
  const url = `${window.location.pathname}${window.location.search}${remaining ? `#${remaining}` : ''}`;
  window.history.replaceState(window.history.state, '', url);
}

function submittedInitDataMarker(initData: string): string {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (hash) return `${params.get('auth_date') ?? ''}:${hash}`;
  return `${initData.length}:${initData.slice(0, 64)}`;
}

function readSubmittedInitDataMarker(): string | null {
  try {
    return window.sessionStorage.getItem(SUBMITTED_INIT_DATA_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSubmittedInitDataMarker(marker: string) {
  try {
    window.sessionStorage.setItem(SUBMITTED_INIT_DATA_STORAGE_KEY, marker);
  } catch {
    // Auth should still proceed if storage is unavailable.
  }
}

async function hasMatchingSession(initData: string, signal: AbortSignal): Promise<boolean> {
  try {
    const user = JSON.parse(new URLSearchParams(initData).get('user') ?? 'null');
    if (!Number.isSafeInteger(user?.id) || user.id <= 0) return false;
    const response = await fetch('/api/telegram-webapp', {
      credentials: 'include', cache: 'no-store', signal,
    });
    if (!response.ok) return false;
    const session = await response.json();
    return session.telegramId === user.id;
  } catch {
    return false;
  }
}

/**
 * Auth'dan keyin qayerga qaytish:
 * 1. `?from=/...` bo'lsa (login sahifasiga server redirect qo'ygan) — o'sha yerga.
 *    Faqat ichki path qabul qilinadi (open-redirect himoyasi).
 * 2. Landing (`/`) da ochilgan bo'lsa (bot menyusidagi "Open mini app") —
 *    to'g'ridan-to'g'ri bozorga.
 * 3. Boshqa sahifada ochilgan bo'lsa — joriy sahifani qayta yuklaymiz
 *    (deep link allaqachon to'g'ri URL'da).
 * 4. Aks holda (auth sahifalari, from'siz) — /profile.
 */
function resolvePostLoginTarget(): string {
  const from = new URLSearchParams(window.location.search).get('from');
  if (from && isSafeInternalPath(from)) return from;
  const path = window.location.pathname;
  if (path === '/') return '/marketplace';
  if (!path.startsWith('/auth')) {
    return path + window.location.search + window.location.hash;
  }
  return '/profile';
}

/**
 * initData'ni top-level form POST bilan `/api/telegram-webapp` ga yuboradi.
 * Cookie aynan shu navigatsiya javobida keladi (route.ts izohiga qarang).
 * Shartlar ekranidagi "Tekshirish" tugmasi ham shu yo'ldan qayta kiradi.
 */
export function submitTelegramWebAppLogin(initData: string, from: string): HTMLFormElement {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/telegram-webapp';
  form.acceptCharset = 'utf-8';
  form.style.display = 'none';

  const addField = (name: string, value: string) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };
  addField('initData', initData);
  addField('from', from);
  addField('framed', window.self !== window.top ? '1' : '0');

  document.body.appendChild(form);
  form.submit();
  return form;
}

/**
 * Mini App context aniqlansa avtomatik login qiladi.
 *
 * Root layout'ga qo'yiladi → har qanday entry point'da (landing, /auth/login,
 * /auth/register va h.k.) ishlaydi. Mini App emas — `idle` qaytaradi, ya'ni
 * komponent ko'rinmaydi va oddiy UX'ga ta'sir qilmaydi.
 */
export function TelegramWebAppAutoLogin() {
  const router = useRouter();
  const [state, setState] = React.useState<'idle' | 'authing' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const submittedRef = React.useRef(false);
  const initDataRef = React.useRef<string | null>(null);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const [retryKey, setRetryKey] = React.useState(0);

  React.useEffect(() => {
    if (state !== 'authing') return;
    const timeout = window.setTimeout(() => {
      setError('Telegram orqali kirish cho‘zilib ketdi. Qayta urinib ko‘ring.');
      setState('error');
    }, LOGIN_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [state, retryKey]);

  React.useEffect(() => {
    if (submittedRef.current) return;
    const launchContext = hasTelegramLaunchContext();
    // Shartlar ekranida o'zi qayta urinmaydi: shart bajarilmagani uchun shu
    // yerga kelindi, avtomatik urinish esa sahifani cheksiz aylantirardi.
    // Qayta kirish faqat foydalanuvchi "Tekshirish" ni bosganda.
    if (!launchContext && window.location.pathname.startsWith('/access-required')) return;
    let cancelled = false;
    let timer: number | undefined;
    let sessionTimer: number | undefined;
    let attempts = 0;
    const controller = new AbortController();

    const submitInitData = async (initData: string) => {
      if (cancelled || submittedRef.current) return;
      const submittedMarker = submittedInitDataMarker(initData);
      const previouslySubmitted = !launchContext && readSubmittedInitDataMarker() === submittedMarker;
      initDataRef.current = initData;
      setState('authing');
      const matchingSession = await Promise.race([
        hasMatchingSession(initData, controller.signal),
        new Promise<false>((resolve) => {
          sessionTimer = window.setTimeout(() => {
            controller.abort();
            resolve(false);
          }, 4000);
        }),
      ]);
      window.clearTimeout(sessionTimer);
      if (cancelled) return;
      submittedRef.current = true;
      writeSubmittedInitDataMarker(submittedMarker);
      removeTelegramLaunchHash();
      if (matchingSession) {
        setState('idle');
        const target = resolvePostLoginTarget();
        const current = window.location.pathname + window.location.search + window.location.hash;
        if (target !== current) router.replace(target);
        return;
      }
      if (previouslySubmitted) {
        setError('Telegram orqali kirish yakunlanmadi. Qayta urinib ko‘ring.');
        setState('error');
        return;
      }

      try {
        formRef.current = submitTelegramWebAppLogin(initData, resolvePostLoginTarget());
      } catch {
        submittedRef.current = false;
        setError('Telegram orqali kirib bo‘lmadi. Mini Appni qayta oching.');
        setState('error');
      }
    };

    const attempt = () => {
      if (cancelled || submittedRef.current) return;
      const initData = readMiniAppInitData() ?? initDataRef.current;
      if (initData) {
        submitInitData(initData);
        return;
      }
      if (!launchContext) return;

      attempts += 1;
      if (attempts >= HYDRATION_ATTEMPTS) {
        setError('Telegram ma’lumotlari yuklanmadi. Mini Appni qayta oching yoki qayta urining.');
        setState('error');
        return;
      }
      setState('authing');
      timer = window.setTimeout(attempt, HYDRATION_INTERVAL_MS);
    };

    attempt();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(sessionTimer);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [retryKey, router]);

  if (state === 'idle') return null;

  if (state === 'authing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur">
        <div className="rounded-xl border border-border bg-card px-6 py-5 shadow-card-hover">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-foreground">Telegram orqali avtomatik kirilmoqda…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed left-4 right-4 top-4 z-50">
      <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-card px-4 py-3 text-sm text-destructive shadow-card-hover">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">{error ?? 'Mini App auth muvaffaqiyatsiz'}</span>
        <button
          type="button"
          onClick={() => {
            submittedRef.current = false;
            writeSubmittedInitDataMarker('');
            formRef.current?.remove();
            formRef.current = null;
            setError(null);
            setState('idle');
            setRetryKey((value) => value + 1);
          }}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 font-bold text-foreground hover:bg-muted"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Qayta urinish
        </button>
      </div>
    </div>
  );
}
