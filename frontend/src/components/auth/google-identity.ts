export interface GoogleIdentity {
  initialize(config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
  }): void;
  prompt(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

const SDK = 'https://accounts.google.com/gsi/client';
let pending: Promise<GoogleIdentity> | null = null;

function identity() {
  const api = window.google?.accounts?.id;
  return typeof api?.initialize === 'function' && typeof api?.prompt === 'function' ? api : null;
}

/** Share an in-flight download; failed attempts can be explicitly retried. */
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  const cached = identity();
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.querySelector<HTMLScriptElement>(`script[src="${SDK}"]`)
      ?? document.createElement('script');
    const timer = window.setTimeout(() => finish(new Error('Google SDK timed out')), 15_000);

    function finish(error?: Error) {
      window.clearTimeout(timer);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      const api = identity();
      if (error || !api) {
        script.remove();
        reject(error ?? new Error('Google SDK unavailable'));
      } else {
        resolve(api);
      }
    }
    function onLoad() { finish(); }
    function onError() { finish(new Error('Google SDK failed to load')); }
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!script.isConnected) {
      script.src = SDK;
      script.async = true;
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      document.head.append(script);
    }
  }).finally(() => { pending = null; });
  return pending;
}
