import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), '..');
const deploy = readFileSync(join(root, 'deploy.sh'), 'utf8');
const settings = {
  FIREBASE_WEB_API_KEY: 'test-api-key',
  FIREBASE_PROJECT_ID: 'test-project',
  FIREBASE_MESSAGING_SENDER_ID: '12345',
  FIREBASE_WEB_APP_ID: '1:12345:web:test',
  FIREBASE_WEB_VAPID_KEY: 'test-public-vapid',
  FIREBASE_PUSH_ENABLED: 'true',
};
function run(extra: Record<string, string | undefined>, command = 'configure_firebase_push\nprintf "%s" "${COMPOSE_FILE:-}"') {
  const dir = mkdtempSync(join(tmpdir(), 'firebase-deploy-'));
  const credential = join(dir, 'firebase-admin.json');
  writeFileSync(credential, '{}');
  const functions = ['upsert_env', 'assert_safe_for_env', 'require_env', 'configure_firebase_push', 'write_env']
    .map(name => deploy.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'))?.[0] ?? '').join('\n');
  try {
    return spawnSync('bash', ['-c', `set -eu\n${functions}\n${command}`], {
      cwd: dir, encoding: 'utf8', env: {
        NODE_ENV: 'test', PATH: process.env.PATH, ...settings, FIREBASE_CREDENTIALS_FILE: credential,
        CARD_INTEREST_HMAC_SECRET: 'test-hmac', INTERNAL_API_SECRET: 'test-internal', ...extra,
      },
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('Firebase deployment', () => {
  it('forwards every Firebase setting from GitHub secrets over SSH', () => {
    const workflow = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8');
    const forwarded = workflow.match(/^\s+envs: (.+)$/m)?.[1].split(',') ?? [];
    for (const key of [...Object.keys(settings), 'FIREBASE_CREDENTIALS_FILE']) {
      expect(forwarded).toContain(key);
      expect(workflow).toMatch(new RegExp(`${key}:\\s+\\$\\{\\{ secrets\\.${key} \\}\\}`));
    }
  });
  it('selects the read-only credential mount for file-based credentials', () => {
    const result = run({});
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('docker-compose.yml:frontend/docs/firebase-push.compose.yml');
  });
  it('leaves the optional mount off when push is disabled or uses workload credentials', () => {
    for (const env of [{ FIREBASE_PUSH_ENABLED: 'false' }, { FIREBASE_CREDENTIALS_FILE: '' }]) {
      const result = run(env);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe('');
    }
  });
  it('rejects incomplete enabled configuration and missing credential files before deployment', () => {
    for (const env of [{ FIREBASE_WEB_VAPID_KEY: '' }, { FIREBASE_CREDENTIALS_FILE: '/missing/firebase.json' }, { FIREBASE_CREDENTIALS_FILE: 'relative.json' }]) {
      const result = run(env);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('FIREBASE_');
    }
  });
  it('keeps Firebase settings when deployment regenerates .env', () => {
    const result = run({}, 'configure_firebase_push\nwrite_env\ncat .env');
    expect(result.status, result.stderr).toBe(0);
    for (const [key, value] of Object.entries(settings)) expect(result.stdout).toContain(`${key}=${value}\n`);
    expect(result.stdout).toMatch(/FIREBASE_CREDENTIALS_FILE=\/.*firebase-admin\.json/);
  });
});
