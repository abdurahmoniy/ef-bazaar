import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const provider = readFileSync(new URL('./telegram-back-provider.tsx', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../../hooks/use-telegram-back-button.ts', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../marketplace/marketplace-listing-detail.tsx', import.meta.url), 'utf8');

describe('Telegram native back ownership', () => {
  it('attaches the SDK listener only in the root provider', () => {
    expect(provider).toContain('backButton.onClick');
    expect(provider).toContain('backButton.offClick');
    expect(hook).not.toContain('.onClick(');
    expect(hook).not.toContain('.offClick(');
  });

  it('prioritizes overlays and reference-counts swipe locks', () => {
    expect(provider).toContain("kind === 'overlay'");
    expect(provider).toContain('lockVerticalSwipes');
    expect(provider).toContain('disableVerticalSwipes');
    expect(provider).toContain('enableVerticalSwipes');
  });

  it('removes the duplicate detail-page BackLink', () => {
    expect(detail).not.toContain('<BackLink');
  });
});
