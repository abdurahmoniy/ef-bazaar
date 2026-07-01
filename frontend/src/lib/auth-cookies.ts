interface AuthCookieEnv {
  AUTH_COOKIE_DOMAIN?: string;
  NODE_ENV?: string;
}

export function normalizeCookieDomain(domain?: string) {
  const normalized = domain?.trim().replace(/^\.+/, '');
  return normalized || undefined;
}

/**
 * Cookie options for auth tokens.
 *
 * <p>Production uses {@code SameSite=None; Secure; Partitioned} so the cookie
 * survives inside a Telegram Web Mini App iframe — the top-level origin there
 * is {@code web.telegram.org}, so any {@code SameSite=Lax} cookie set by our
 * server-action response would be silently dropped by the browser and the
 * auto-login would look like it worked but leave no session behind. Chrome
 * (CHIPS) additionally requires {@code Partitioned} for third-party cookies to
 * keep them keyed per top-level site.
 *
 * <p>Development keeps {@code SameSite=Lax} without {@code Secure} because
 * browsers reject {@code SameSite=None} on non-HTTPS origins.
 */
export function getAuthCookieOptions(
  env: AuthCookieEnv = {
    AUTH_COOKIE_DOMAIN: process.env.AUTH_COOKIE_DOMAIN,
    NODE_ENV: process.env.NODE_ENV,
  },
) {
  const domain = normalizeCookieDomain(env.AUTH_COOKIE_DOMAIN);
  const isProduction = env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ('none' as const) : ('lax' as const),
    partitioned: isProduction,
    path: '/',
    ...(domain ? { domain } : {}),
  };
}

export function getAuthCookieClearOptions(env?: AuthCookieEnv) {
  const options = {
    ...getAuthCookieOptions(env),
    maxAge: 0,
  };

  if (!('domain' in options)) return [options];

  const { domain: _domain, ...hostOnlyOptions } = options;
  return [options, hostOnlyOptions];
}
