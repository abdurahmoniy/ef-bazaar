import { describe, expect, it } from 'vitest';

import type { UserbotAccount } from './userbot-types';
import {
  bindable, canReconnect, codeDestination, handleLine, initials, relativeAgo,
  sanitizeCode, sortAccounts, sourceLabel, statusBadge, summarize,
} from './userbot-view';

function acc(over: Partial<UserbotAccount> = {}): UserbotAccount {
  return {
    id: 'a1', firstName: 'Aziz', lastName: 'Karimov', username: 'aziz_pay',
    phoneMasked: '+998 ******* 67', status: 'ACTIVE', statusReason: null, source: 'PANEL',
    connectedBy: null, connectedAt: '2026-10-01T10:00:00Z', alive: true,
    lastHeartbeat: '2026-10-03T08:00:00Z', runner: 'core', features: [], hasAvatar: false,
    ...over,
  };
}

const NOW = new Date('2026-10-03T08:00:12Z');

describe('statusBadge', () => {
  it('an active account with a fresh heartbeat is alive', () => {
    expect(statusBadge(acc())).toEqual({ label: 'Tirik', tone: 'alive' });
  });
  it('an active account that stopped answering is flagged, not shown as alive', () => {
    expect(statusBadge(acc({ alive: false }))).toEqual({ label: 'Javob bermayapti', tone: 'down' });
  });
  it('revoked and disconnected accounts say so', () => {
    expect(statusBadge(acc({ status: 'REVOKED', alive: false })).tone).toBe('revoked');
    expect(statusBadge(acc({ status: 'DISCONNECTED', alive: false })).label).toBe('Uzilgan');
  });
});

describe('relativeAgo', () => {
  it.each([
    ['2026-10-03T08:00:00Z', '12 soniya oldin'],
    ['2026-10-03T07:55:12Z', '5 daqiqa oldin'],
    ['2026-10-03T05:00:12Z', '3 soat oldin'],
    ['2026-10-01T08:00:12Z', '2 kun oldin'],
  ])('%s → %s', (iso, text) => {
    expect(relativeAgo(iso, NOW)).toBe(text);
  });
  it('no heartbeat yet is a dash', () => {
    expect(relativeAgo(null, NOW)).toBe('—');
  });
  it('a timestamp slightly in the future (clock skew) is "hozirgina"', () => {
    expect(relativeAgo('2026-10-03T08:00:15Z', NOW)).toBe('hozirgina');
  });
});

it('initials use first letters, upper-cased, and survive a missing last name', () => {
  expect(initials('aziz', 'karimov')).toBe('AK');
  expect(initials('Support', null)).toBe('S');
  expect(initials('', null)).toBe('?');
});

it('the handle line hides nothing more than the masked phone', () => {
  expect(handleLine(acc())).toBe('@aziz_pay · +998 ******* 67');
  expect(handleLine(acc({ username: null }))).toBe('+998 ******* 67');
});

it('source label tells the terminal import apart', () => {
  expect(sourceLabel(acc({ source: 'IMPORTED' }))).toBe('Terminal orqali import qilingan');
  expect(sourceLabel(acc())).toBe('Panel orqali ulangan');
});

it('summary counts revoked and silent active accounts as needing attention', () => {
  expect(summarize([
    acc(), acc({ id: 'b', alive: false }), acc({ id: 'c', status: 'REVOKED', alive: false }),
    acc({ id: 'd', status: 'DISCONNECTED', alive: false }),
  ])).toEqual({ total: 4, alive: 1, attention: 2 });
});

it('bound accounts come first, then active, revoked, disconnected', () => {
  const list = sortAccounts([
    acc({ id: 'disc', status: 'DISCONNECTED' }),
    acc({ id: 'rev', status: 'REVOKED' }),
    acc({ id: 'free' }),
    acc({ id: 'pay', features: ['PAYMENT'] }),
  ]);
  expect(list.map((a) => a.id)).toEqual(['pay', 'free', 'rev', 'disc']);
});

it('only active accounts can be bound to a feature', () => {
  expect(bindable([acc(), acc({ id: 'r', status: 'REVOKED' })]).map((a) => a.id)).toEqual(['a1']);
});

it('reconnect is offered for revoked and disconnected accounts only', () => {
  expect(canReconnect(acc())).toBe(false);
  expect(canReconnect(acc({ status: 'REVOKED' }))).toBe(true);
  expect(canReconnect(acc({ status: 'DISCONNECTED' }))).toBe(true);
});

it.each([
  ['APP', 'Telegram ilovangizga'], ['SMS', 'SMS orqali'], ['CALL', "qo'ng'iroq orqali"],
  ['FLASH_CALL', "qo'ng'iroq orqali"], ['EMAIL_CODE', 'emailingizga'], [undefined, "Telegram'ga"],
])('code destination %s', (type, text) => {
  expect(codeDestination(type)).toBe(text);
});

it('the code field keeps digits only, at most six', () => {
  expect(sanitizeCode(' 12-34 5a678 ')).toBe('123456');
});
