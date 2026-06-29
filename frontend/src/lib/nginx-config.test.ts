import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const configPath = join(process.cwd(), '..', 'nginx', 'conf.d', 'efbazaar.conf');

function extractBlocks(config: string, directive: RegExp) {
  const blocks: string[] = [];
  let searchIndex = 0;

  while (searchIndex < config.length) {
    const rest = config.slice(searchIndex);
    directive.lastIndex = 0;
    const match = directive.exec(rest);
    if (!match) break;

    const blockStart = searchIndex + match.index;
    const braceStart = config.indexOf('{', blockStart);
    if (braceStart === -1) break;

    let depth = 0;
    for (let index = braceStart; index < config.length; index += 1) {
      if (config[index] === '{') depth += 1;
      if (config[index] === '}') depth -= 1;

      if (depth === 0) {
        blocks.push(config.slice(blockStart, index + 1));
        searchIndex = index + 1;
        break;
      }
    }
  }

  return blocks;
}

describe('nginx marketplace routing', () => {
  it('authenticates marketplace requests in the internal SSR server block', () => {
    const config = readFileSync(configPath, 'utf8');
    const internalServer = extractBlocks(config, /\bserver\s*\{/g).find((block) =>
      /\blisten\s+8080\s*;/.test(block),
    );

    expect(internalServer).toBeDefined();

    const marketplaceLocation = extractBlocks(
      internalServer ?? '',
      /\blocation\s+\/api\/marketplace\/\s*\{/g,
    )[0];

    expect(marketplaceLocation).toContain('auth_request /_auth_verify;');
    expect(marketplaceLocation).toContain('error_page 401 = @marketplace_anon;');
    expect(marketplaceLocation).toContain('auth_request_set $user_id');
    expect(marketplaceLocation).toContain('auth_request_set $user_roles');
    expect(marketplaceLocation).toContain('auth_request_set $telegram_id');
    expect(marketplaceLocation).toContain('proxy_set_header X-User-Id');
    expect(marketplaceLocation).toContain('proxy_set_header X-User-Roles');
    expect(marketplaceLocation).toContain('proxy_set_header X-Telegram-Id');
  });
});
