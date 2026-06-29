import type { User } from './types';

export type AuthPageUserLoader = () => Promise<User | null>;

export async function resolveAuthPageUser(loadUser: AuthPageUserLoader) {
  try {
    return await loadUser();
  } catch {
    return null;
  }
}
