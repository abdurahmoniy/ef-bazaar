import { redirect } from 'next/navigation';

/**
 * Register was folded into login — Telegram and Google endpoints both do
 * register-or-login server-side, so a dedicated register surface is no
 * longer needed. Old bookmarks land straight on the unified login page.
 */
export default function RegisterRedirect() {
  redirect('/auth/login');
}
