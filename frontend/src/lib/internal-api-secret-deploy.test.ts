import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(process.cwd(), '..');

describe('internal API secret deployment', () => {
  it('injects the secret into both escrow services', () => {
    const compose = readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf8');
    const trade = compose.slice(
      compose.indexOf('  trade-service:'),
      compose.indexOf('  payment-service:'),
    );
    const payment = compose.slice(
      compose.indexOf('  payment-service:'),
      compose.indexOf('  smart-admin-worker:'),
    );

    expect(trade).toContain('INTERNAL_API_SECRET: ${INTERNAL_API_SECRET:-}');
    expect(payment).toContain('INTERNAL_API_SECRET: ${INTERNAL_API_SECRET:-}');
  });

  it('fails deployment when escrow services receive a missing or mismatched secret', () => {
    const deploy = readFileSync(join(repoRoot, 'deploy.sh'), 'utf8');

    expect(deploy).toContain(
      'require_env INTERNAL_API_SECRET "${INTERNAL_API_SECRET:-}"',
    );
    expect(deploy).toContain('verify_internal_api_secret');
    expect(deploy).toContain('trade/payment INTERNAL_API_SECRET mismatch');
  });
});
