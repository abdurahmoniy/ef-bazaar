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
