// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { canInterrupt, markInterrupted, getPopupSessionId, isPopupRoute, isQuietForPopup, acquireAttention } from './policy';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); document.body.innerHTML = ''; });
describe('proactive attention policy', () => {
  it.each(['/auth/login', '/marketplace/new', '/marketplace/abc/edit', '/chats', '/wallet', '/admin/popups', '/support', '/profile/edit', '/notifications'])('never interrupts %s', path => {
    expect(isPopupRoute(path)).toBe(false);
  });
  it.each(['/marketplace', '/marketplace/123e4567-e89b-12d3-a456-426614174000', '/profile?tab=accounts', '/help', '/invite'])('allows settled browsing on %s', path => {
    expect(isPopupRoute(path)).toBe(true);
  });
  it('defers while editing, while another dialog is open, and while hidden', () => {
    const input = document.createElement('input'); document.body.append(input); input.focus();
    expect(isQuietForPopup(document)).toBe(false);
    input.blur();
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); document.body.append(dialog);
    expect(isQuietForPopup(document)).toBe(false);
    dialog.remove();
    const support = document.createElement('div'); support.setAttribute('data-interruption-open', 'support'); document.body.append(support);
    expect(isQuietForPopup(document)).toBe(false);
    support.remove();
    expect(isQuietForPopup(document)).toBe(true);
  });
  it('shares one attention slot across a campaign and the push invitation', () => {
    const release = acquireAttention();
    expect(release).not.toBeNull(); expect(acquireAttention()).toBeNull();
    release!(); const next = acquireAttention(); expect(next).not.toBeNull(); next!();
  });
  it('remembers a consumed session and enforces six-hour spacing across sessions', () => {
    const now = Date.now();
    const session = getPopupSessionId('a');
    expect(getPopupSessionId('a')).toBe(session);
    expect(canInterrupt('a', now)).toBe(true);
    markInterrupted('a', now);
    expect(canInterrupt('a', now + 7*3600_000)).toBe(false);
    sessionStorage.clear();
    expect(canInterrupt('a', now + 3600_000)).toBe(false);
    expect(canInterrupt('a', now + 6*3600_000)).toBe(true);
    markInterrupted('a', now + 6*3600_000); sessionStorage.clear();
    expect(canInterrupt('a', now + 13*3600_000)).toBe(false);
    expect(canInterrupt('a', now + 25*3600_000)).toBe(true);
    expect(canInterrupt('b', now)).toBe(true);
  });
});
it.each(['/profile','/profile?tab=trades','/profile?tab=kartalar','/profile?tab=account'])('protects profile financial/settings context %s', path => {
  expect(isPopupRoute(path)).toBe(false);
});
it.each(['/profile?tab=accounts','/profile?tab=favorites','/marketplace?q=Messi'])('permits safe browsing with query %s', path => expect(isPopupRoute(path)).toBe(true));
