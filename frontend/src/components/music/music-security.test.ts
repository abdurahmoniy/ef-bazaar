import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('music browser security policy', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('allows only the required YouTube script and frame origins in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const configPath = path.resolve(process.cwd(), 'next.config.mjs');
    const { default: config } = await import(configPath);
    const rules = await config.headers();
    const headers = rules.find((rule: { source: string }) => rule.source === '/(.*)').headers;
    const csp = headers.find((header: { key: string }) => header.key === 'Content-Security-Policy').value as string;
    const directive = (name: string) => csp.split('; ').find(part => part.startsWith(`${name} `))!.split(' ').slice(1);
    expect(directive('script-src')).toContain('https://www.youtube.com');
    expect(directive('script-src')).toContain('https://s.ytimg.com');
    expect(directive('frame-src')).toContain('https://www.youtube.com');
    expect(directive('script-src')).not.toContain('https:');
    expect(directive('frame-src')).not.toContain('*');
    expect(directive('object-src')).toEqual(["'none'"]);
    expect(headers.find((header: { key: string }) => header.key === 'Referrer-Policy').value).toBe('strict-origin-when-cross-origin');
  });
});
