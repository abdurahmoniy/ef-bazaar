import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./player-filter-dialog.tsx', import.meta.url), 'utf8');
const launcher = readFileSync(new URL('./player-filter-launcher.tsx', import.meta.url), 'utf8');

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

  it('records interest only after Apply and never blocks navigation', () => {
    expect(launcher).toContain("['v1', 'card-interest', 'apply']");
    expect(launcher).toContain('keepalive: true');
    expect(launcher).toContain('.catch(() => undefined)');
    expect(launcher.indexOf("['v1', 'card-interest', 'apply']"))
      .toBeGreaterThan(launcher.indexOf('function apply('));
    expect(launcher.indexOf('router.push('))
      .toBeGreaterThan(launcher.indexOf("['v1', 'card-interest', 'apply']"));
  });
});
