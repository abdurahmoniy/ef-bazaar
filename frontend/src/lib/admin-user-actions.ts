import { isAdmin } from './admin';
import { isTradeAdmin } from './trade-human';
import type { User } from './types';

export type AdminUserRoleMutation = 'USER' | 'ADMIN' | 'TRADE_ADMIN';
export type AdminUserMenuAction =
  | 'toggle-admin'
  | 'toggle-trade-admin'
  | 'delete';

export interface AdminUserActionConfig {
  label: string;
  confirmation: string;
  role?: AdminUserRoleMutation;
  destructive?: boolean;
}

export function adminUserActionConfig(
  user: User,
  action: AdminUserMenuAction,
): AdminUserActionConfig {
  switch (action) {
    case 'toggle-admin': {
      const admin = isAdmin(user);
      return {
        role: admin ? 'USER' : 'ADMIN',
        label: admin ? 'Adminlikdan olish' : 'Admin qilish',
        confirmation: admin
          ? `${user.displayName} adminlikdan olinsinmi?`
          : `${user.displayName} admin qilinsinmi?`,
      };
    }
    case 'toggle-trade-admin': {
      const tradeAdmin = isTradeAdmin(user);
      return {
        role: tradeAdmin ? 'USER' : 'TRADE_ADMIN',
        label: tradeAdmin ? 'Inson adminlikdan olish' : 'Inson admin qilish',
        confirmation: tradeAdmin
          ? `${user.displayName} inson adminlikdan olinsinmi?`
          : `${user.displayName} inson admin qilinsinmi?`,
      };
    }
    case 'delete':
      return {
        label: "O'chirish",
        confirmation: `${user.displayName} akkaunti butunlay o'chirilsinmi? Bu amalni qaytarib bo'lmaydi!`,
        destructive: true,
      };
  }
}

export function adminUserBadges(user: User): string[] {
  const badges: string[] = [];
  if (isAdmin(user)) badges.push('Admin');
  if (isTradeAdmin(user)) badges.push('Inson admin');
  return badges;
}
