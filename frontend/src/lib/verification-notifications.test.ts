import { describe, expect, it } from 'vitest';
import { selectVerificationNotifications } from './verification-notifications';
import { notificationLabel, notificationHref } from './notifications-client';
import type { NotificationResponse } from './marketplace-types';
const now = Date.parse('2026-10-07T10:00:00Z');
const item = (id: string, overrides = {}): NotificationResponse => ({ id, type: 'TRADE_LOGIN_CODE', verificationCode: '001234', tradeId: 'trade', chatId: 'chat', createdAt: new Date(now - 1000).toISOString(), ...overrides });
describe('verification notifications', () => {
  it('accepts fresh unread codes and keeps their leading zeroes', () => {
    expect(selectVerificationNotifications([item('a')], new Set(), now)[0].verificationCode).toBe('001234');
    expect(notificationLabel(item('a'))).toContain('001234');
    expect(notificationHref(item('a'))).toBe('/chats/chat');
  });
  it('rejects expired, future, invalid, read, missing and dismissed codes', () => {
    const values = [item('expired', { createdAt: new Date(now - 300001).toISOString() }), item('future', { createdAt: new Date(now + 1).toISOString() }), item('invalid', { createdAt: 'bad' }), item('read', { readAt: 'yes' }), item('missing', { verificationCode: null }), item('bad', { verificationCode: 'code<script>' }), item('dismissed')];
    expect(selectVerificationNotifications(values, new Set(['dismissed']), now)).toEqual([]);
  });
  it('only offers newest code per trade and purpose, even when newest was dismissed', () => {
    const old = item('old', { createdAt: new Date(now - 2000).toISOString() });
    const newer = item('new');
    const email = item('email', { type: 'TRADE_EMAIL_CHANGE_CODE' });
    const other = item('other', { tradeId: 'other' });
    expect(selectVerificationNotifications([old, newer, email, other], new Set(), now).map(n => n.id)).toEqual(['new', 'email', 'other']);
    expect(selectVerificationNotifications([old, newer], new Set(['new']), now)).toEqual([]);
  });
});
