// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { MailboxResources } from './mailbox-resources';
import { fetchMailboxResources, startReleaseCheck, getReleaseCheck, releaseMailbox } from '@/lib/mailbox-resources';
vi.mock('@/lib/mailbox-resources', async (original) => ({ ...(await original<typeof import('@/lib/mailbox-resources')>()), fetchMailboxResources: vi.fn(), startReleaseCheck: vi.fn(), getReleaseCheck: vi.fn(), releaseMailbox: vi.fn() }));
let container: HTMLDivElement; let root: Root;
const box = { id: 'box', email: 'box@efbazaar.uz', accessState: 'RECOVERY', activeTrade: false, legalHold: false, usageBytes: null, quotaBytes: null, usageStatus: 'ERROR', usageError: 'Mailcow unreachable', usageObservedAt: null, mailcowPresent: true, deleted: false, deletionStatus: 'PENDING', deletionError: null };
const click = async (text: string) => act(async () => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text))!.click());
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container); vi.mocked(fetchMailboxResources).mockResolvedValue([box] as never); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('keeps storage errors and physical deletion pending visible', async () => {
  await act(async () => root.render(createElement(MailboxResources, { admin: true })));
  expect(container.textContent).toContain('Mailcow unreachable');
  expect(container.textContent).toContain('Mailcow: mavjud');
  expect(container.textContent).toContain('O‘chirish kutilmoqda');
  expect(container.textContent).not.toContain('0 B');
});
it('does not offer final release until the backend verifies fresh proof', async () => {
  vi.mocked(fetchMailboxResources).mockResolvedValue([{ ...box, deletionStatus: 'NONE' }] as never);
  vi.mocked(startReleaseCheck).mockResolvedValue({ requestId: 'p', status: 'PENDING', expiresAt: '2099-01-01T00:00:00Z' });
  vi.mocked(getReleaseCheck).mockResolvedValue({ requestId: 'p', status: 'VERIFIED', expiresAt: '2099-01-01T00:00:00Z' });
  await act(async () => root.render(createElement(MailboxResources)));
  await click('Tashqi pochtaga ko‘chirish');
  expect(container.textContent).toContain('Konami');
  expect(releaseMailbox).not.toHaveBeenCalled();
  expect([...container.querySelectorAll('button')].find(b => b.textContent?.includes('Butunlay o‘chirish'))?.disabled).toBe(true);
  await click('Isbotni tekshirish');
  expect([...container.querySelectorAll('button')].find(b => b.textContent?.includes('Butunlay o‘chirish'))?.disabled).toBe(false);
  expect(releaseMailbox).not.toHaveBeenCalled();
});
it('requires a new backend proof after physical deletion fails', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(fetchMailboxResources).mockResolvedValueOnce([{ ...box, deletionStatus: 'NONE' }] as never).mockResolvedValue([{ ...box, deletionStatus: 'FAILED', deletionError: 'Mailcow refused' }] as never);
  vi.mocked(startReleaseCheck).mockResolvedValue({ requestId: 'p', status: 'VERIFIED', expiresAt: '2099-01-01T00:00:00Z' });
  vi.mocked(releaseMailbox).mockResolvedValue({ requestId: 'p', status: 'FAILED', lastError: 'Mailcow refused' });
  await act(async () => root.render(createElement(MailboxResources)));
  await click('Tashqi pochtaga ko‘chirish');
  await click('Butunlay o‘chirish');
  expect(container.textContent).toContain('Mailcow refused');
  expect([...container.querySelectorAll('button')].some(b => b.textContent?.includes('Butunlay o‘chirish'))).toBe(false);
  expect([...container.querySelectorAll('button')].some(b => b.textContent?.includes('Tashqi pochtaga ko‘chirish'))).toBe(true);
  vi.restoreAllMocks();
});
it('expires verified proof visibly and disables release when its deadline passes', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T00:00:00Z'));
  vi.mocked(fetchMailboxResources).mockResolvedValue([{ ...box, deletionStatus: 'NONE' }] as never);
  vi.mocked(startReleaseCheck).mockResolvedValue({ requestId: 'p', status: 'VERIFIED', expiresAt: '2026-10-19T00:00:01Z' });
  await act(async () => root.render(createElement(MailboxResources)));
  await click('Tashqi pochtaga ko‘chirish');
  expect([...container.querySelectorAll('button')].find(b => b.textContent?.includes('Butunlay o‘chirish'))?.disabled).toBe(false);
  await act(async () => vi.advanceTimersByTime(1001));
  expect(container.textContent).toContain('EXPIRED');
  expect([...container.querySelectorAll('button')].find(b => b.textContent?.includes('Butunlay o‘chirish'))?.disabled).toBe(true);
  vi.useRealTimers();
});
it('keeps retained allocation release available without offering revoked mail access', async () => {
  vi.mocked(fetchMailboxResources).mockResolvedValue([{ ...box, ownerUserId: null, retainedUserId: 'me', deletionStatus: 'NONE' }] as never);
  await act(async () => root.render(createElement(MailboxResources)));
  expect(container.querySelector('a')).toBeNull();
  expect(container.textContent).toContain('Kirish huquqi uzilgan');
  expect([...container.querySelectorAll('button')].some(b => b.textContent?.includes('Tashqi pochtaga ko‘chirish'))).toBe(true);
});
it('shows unresolved provisioning and blocks release while preserving existing owner export access', async () => {
  vi.mocked(fetchMailboxResources).mockResolvedValue([{ ...box, ownerUserId: 'me', deletionStatus: 'NONE', provisioningStatus: 'STARTED', provisioningClaimId: 'claim', provisioningError: 'Provisioning outcome unknown' }] as never);
  await act(async () => root.render(createElement(MailboxResources)));
  expect(container.textContent).toContain('Yaratish natijasi tasdiqlanmagan');
  expect(container.textContent).toContain('Provisioning outcome unknown');
  expect(container.querySelector('a')?.textContent).toContain('eksport');
  const start = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Tashqi pochtaga ko‘chirish'))!;
  expect(start.disabled).toBe(true);
  await act(async () => start.click());
  expect(startReleaseCheck).not.toHaveBeenCalled();
});
