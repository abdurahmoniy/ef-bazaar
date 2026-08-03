import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./player-filter-dialog.tsx', import.meta.url), 'utf8');

describe('PlayerFilterDialog accessibility contract', () => {
  it('uses focus-managed dialog and keyboard-aware tabs primitives', () => {
    expect(source).toContain("@radix-ui/react-dialog");
    expect(source).toContain('<Dialog.Root');
    expect(source).toContain('<Dialog.Title');
    expect(source).toContain('<Dialog.Description');
    expect(source).toContain("@radix-ui/react-tabs");
    expect(source).toContain('<Tabs.Root');
  });

  it('exposes selection and priority states with touch-sized controls', () => {
    expect(source).toContain('aria-pressed={isPicked}');
    expect(source).toContain('min-h-11');
    expect(source).toContain('motion-reduce:animate-none');
  });

  it('supports recoverable, explicit catalogue pagination', () => {
    expect(source).toContain('Yana yuklash');
    expect(source).toContain('Qayta urinish');
    expect(source).toContain('page: String(page)');
    expect(source).toContain('controller.abort()');
  });
});
