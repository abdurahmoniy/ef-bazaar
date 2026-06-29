import type { User } from './types';

export type OptionalUserLoader = () => Promise<User | null>;

export async function resolveOptionalUser(loadUser: OptionalUserLoader) {
  try {
    return await loadUser();
  } catch {
    return null;
  }
}
