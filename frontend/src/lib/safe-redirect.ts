/**
 * Post-login `from=` round-trip target'ini xavfsiz hal qilish.
 *
 * `from` faqat SHU sayt ichidagi path bo'lishi mumkin — open-redirect himoyasi.
 * `/mail/...` ham ichki path hisoblanadi: next.config'dagi redirect uni
 * mail subdomain'iga o'zi olib o'tadi.
 */

const DEFAULT_TARGET = '/profile';

/**
 * Faqat bitta `/` bilan boshlangan path: `//evil.com` (protocol-relative),
 * `/\evil.com` (backslash trick), scheme'li URL'lar va control belgilar
 * (CR/LF va h.k.) rad etiladi.
 */
export function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
    return false;
  }
  return !/[\u0000-\u001f\u007f]/.test(path);
}

/**
 * @param from `?from=` query qiymati (yo'q bo'lsa null/undefined)
 * @returns ichki path bo'lsa o'sha, aks holda `/profile`
 */
export function resolvePostLoginPath(from: string | null | undefined): string {
  return from && isSafeInternalPath(from) ? from : DEFAULT_TARGET;
}

const LOGIN_PATH = '/auth/login';

/**
 * Login havolasi: joriy sahifa (path + query) `from=` ga yoziladi, shunda
 * login'dan keyin user turgan joyiga qaytadi, `/profile` ga emas.
 * Path noma'lum, `/auth/*` ichida yoki xavfsiz bo'lmasa — oddiy `/auth/login`.
 */
export function buildLoginHref(pathname: string | null | undefined, search: string | null | undefined): string {
  if (!pathname || pathname === '/auth' || pathname.startsWith('/auth/')) return LOGIN_PATH;
  const target = search ? `${pathname}?${search}` : pathname;
  if (!isSafeInternalPath(target)) return LOGIN_PATH;
  return `${LOGIN_PATH}?${new URLSearchParams({ from: target })}`;
}
