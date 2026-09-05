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
 * <p>Production uses {@code SameSite=None; Secure} so the cookie is accepted
 * inside a Telegram Mini App WebView (Telegram Desktop / mobile) and by
 * Telegram Web (iframe on web.telegram.org). {@code Partitioned} was tried
 * previously but Telegram Desktop's Qt WebEngine build appears to reject or
 * ignore the resulting cookie — mobile Chromium WebView accepted it, Desktop
 * dropped it and left users bouncing back to the login page. Plain
 * {@code SameSite=None; Secure} is honoured by every current WebView we care
 * about.
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
    path: '/',
    ...(domain ? { domain } : {}),
  };
}

export function getAuthCookieClearOptions(env?: AuthCookieEnv) {
  const options = {
    ...getAuthCookieOptions(env),
    maxAge: 0,
    expires: new Date(0),
  };

  return [options];
}

