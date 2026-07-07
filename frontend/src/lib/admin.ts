import type { User } from './types';

/**
 * Auth-service serializes the role as {@code ["ROLE_ADMIN"]} (see UserMapper);
 * the bare {@code "ADMIN"} spelling is accepted defensively in case the
 * prefixing convention changes.
 */
export function isAdmin(user: User | null | undefined): boolean {
  return !!user?.roles?.some((role) => role === 'ROLE_ADMIN' || role === 'ADMIN');
}
