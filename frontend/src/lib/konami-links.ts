/** Konami's forgot-password page; `?email=` fills the address in for the user. */
export const KONAMI_FORGOT_URL = 'https://my.konami.net/en_US/password-reminder/input-email-address';

export function konamiForgotPasswordUrl(email: string | null | undefined): string {
  return email ? `${KONAMI_FORGOT_URL}?email=${encodeURIComponent(email)}` : KONAMI_FORGOT_URL;
}
