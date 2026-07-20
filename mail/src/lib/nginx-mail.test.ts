import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const mailConfigPath = join(process.cwd(), '..', 'nginx', 'conf.d', 'mail.conf');
const mailcowConfigPath = join(process.cwd(), '..', 'nginx', 'conf.d', 'mailcow.conf');
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

  it('has no Mailcow carve-outs — all Mailcow paths moved to mailcow.efbazaar.uz', () => {
    // /api/ (Mailcow admin), /SOGo, /Microsoft-Server-ActiveSync used to live
    // in this file. After the mailcow.efbazaar.uz cutover they're only served
    // by mailcow.conf.
    expect(mailServer).not.toMatch(/\blocation\s+\/api\/\s*\{/);
    expect(mailServer).not.toMatch(/\blocation\s+\/SOGo\b/);
    expect(mailServer).not.toMatch(/\blocation\s+\/Microsoft-Server-ActiveSync\b/);
    expect(mailServer).not.toContain('host.docker.internal:8443');
  });

  it('declares the mail backend variable for per-request DNS re-resolution', () => {
    const backends = readFileSync(backendsPath, 'utf8');
    expect(backends).toMatch(/set \$backend_mail\s+"mail-frontend:3000";/);
  });
});

describe('nginx mailcow subdomain routing', () => {
  const config = readFileSync(mailcowConfigPath, 'utf8');
  const mailcowServer = extractBlocks(config, /\bserver\s*\{/g).find(
    (block) =>
      /\bserver_name\s+.*mailcow\.efbazaar\.uz\b/.test(block) && /\blisten\s+443\b/.test(block),
  );

  it('mailcow.efbazaar.uz proxies everything to the Mailcow container', () => {
    expect(mailcowServer).toBeDefined();
    const rootLocation = extractBlocks(mailcowServer ?? '', /\blocation\s+\/\s*\{/g)[0];
    expect(rootLocation).toContain('proxy_pass https://host.docker.internal:8443;');
  });

  it('mailcow subdomain serves autodiscover + autoconfig on the same block', () => {
    // Email clients try https://autodiscover.<domain>/autodiscover/autodiscover.xml
    // and https://autoconfig.<domain>/mail/config-v1.1.xml — both must reach
    // Mailcow. Alias them onto the mailcow server block.
    expect(mailcowServer).toMatch(/\bautodiscover\.efbazaar\.uz\b/);
    expect(mailcowServer).toMatch(/\bautoconfig\.efbazaar\.uz\b/);
  });

  it('mailcow subdomain gives ActiveSync longer timeouts for mobile clients', () => {
    const asLocation = extractBlocks(
      mailcowServer ?? '',
      /\blocation\s+\/Microsoft-Server-ActiveSync\b/g,
    )[0];
    expect(asLocation).toBeDefined();
    expect(asLocation).toMatch(/proxy_read_timeout\s+1200s;/);
  });
});
