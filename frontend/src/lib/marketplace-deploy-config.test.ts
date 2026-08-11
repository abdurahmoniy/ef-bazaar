import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const composePath = join(process.cwd(), '..', 'docker-compose.yml');

describe('marketplace deployment configuration', () => {
  it('enables the idempotent legacy listing-card repair by default', () => {
    const compose = readFileSync(composePath, 'utf8');
    expect(compose).toContain(
      'LISTING_CARD_BACKFILL_ENABLED: ${LISTING_CARD_BACKFILL_ENABLED:-true}',
    );
  });
});
