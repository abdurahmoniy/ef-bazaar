interface AuthCookieEnv {
  AUTH_COOKIE_DOMAIN?: string;
  NODE_ENV?: string;
}

export function normalizeCookieDomain(domain?: string) {
  const normalized = domain?.trim().replace(/^\.+/, '');
  return normalized || undefined;
}

export function getAuthCookieOptions(
  env: AuthCookieEnv = {
    AUTH_COOKIE_DOMAIN: process.env.AUTH_COOKIE_DOMAIN,
    NODE_ENV: process.env.NODE_ENV,
  },
) {
  const domain = normalizeCookieDomain(env.AUTH_COOKIE_DOMAIN);

  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
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
