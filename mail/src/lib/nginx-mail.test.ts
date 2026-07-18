import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const mailConfigPath = join(process.cwd(), '..', 'nginx', 'conf.d', 'mail.conf');
const backendsPath = join(process.cwd(), '..', 'nginx', 'conf.d', 'backends.inc');

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

describe('nginx mail subdomain routing', () => {
  const config = readFileSync(mailConfigPath, 'utf8');
  const mailServer = extractBlocks(config, /\bserver\s*\{/g).find(
    (block) =>
      /\bserver_name\s+mail\.efbazaar\.uz\s*;/.test(block) && /\blisten\s+443\b/.test(block),
  );

  it('serves the webmail app at root via the resolver-backed variable', () => {
    expect(mailServer).toBeDefined();
    const rootLocation = extractBlocks(mailServer ?? '', /\blocation\s+\/\s*\{/g)[0];
    expect(rootLocation).toContain('proxy_pass http://$backend_mail$request_uri;');
  });

  it('routes the app API proxy prefix to the app, not Mailcow', () => {
    const tradeLocation = extractBlocks(mailServer ?? '', /\blocation\s+\/api\/trade\/\s*\{/g)[0];
    expect(tradeLocation).toContain('proxy_pass http://$backend_mail$request_uri;');
  });

  it('keeps the Mailcow admin API reachable (smart-admin-worker depends on it)', () => {
    // MAILCOW_API_URL=https://mail.efbazaar.uz/api/v1 — o'chirilsa worker
    // mailbox yarata olmaydi va trade lifecycle to'xtaydi.
    const apiLocation = extractBlocks(mailServer ?? '', /\blocation\s+\/api\/\s*\{/g)[0];
    expect(apiLocation).toContain('proxy_pass https://host.docker.internal:8443;');
  });

  it('keeps autodiscover/autoconfig hosts fully on Mailcow', () => {
    const autoServer = extractBlocks(config, /\bserver\s*\{/g).find(
      (block) =>
        /\bserver_name\s+autodiscover\.efbazaar\.uz\b/.test(block) &&
        /\blisten\s+443\b/.test(block),
    );
    expect(autoServer).toBeDefined();
    expect(autoServer).toContain('proxy_pass https://host.docker.internal:8443;');
  });

  it('declares the mail backend variable for per-request DNS re-resolution', () => {
    const backends = readFileSync(backendsPath, 'utf8');
    expect(backends).toMatch(/set \$backend_mail\s+"mail-frontend:3000";/);
  });
});
