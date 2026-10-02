import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const configPath = join(process.cwd(), '..', 'nginx', 'conf.d', 'efbazaar.conf');
const apiConfigPath = join(process.cwd(), '..', 'nginx', 'conf.d', 'api.conf');
const rootConfigPath = join(process.cwd(), '..', 'nginx', 'nginx.conf');
const authApplicationPath = join(
  process.cwd(),
  '..',
  'backend',
  'auth-service',
  'src',
  'main',
  'resources',
  'application.yml',
);
const envExamplePath = join(process.cwd(), '.env.local.example');

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
  it('rate-limits public card-interest writes by network identity', () => {
    const rootConfig = readFileSync(rootConfigPath, 'utf8');
    const siteConfig = readFileSync(configPath, 'utf8');
    const apiConfig = readFileSync(apiConfigPath, 'utf8');

    expect(rootConfig).toContain('zone=card_interest');
    expect(siteConfig).toContain('limit_req zone=card_interest');
    expect(siteConfig).toContain('proxy_set_header X-Interest-Network $remote_addr;');
    expect(apiConfig).toContain('limit_req zone=card_interest');
    expect(apiConfig).toContain('proxy_set_header X-Interest-Network $remote_addr;');
  });

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

  it('forwards browser cookies to auth verification subrequests', () => {
    const config = readFileSync(configPath, 'utf8');
    const authVerifyLocations = extractBlocks(config, /\blocation\s+=\s+\/_auth_verify\s*\{/g);

    expect(authVerifyLocations.length).toBeGreaterThanOrEqual(2);
    for (const location of authVerifyLocations) {
      expect(location).toContain('proxy_set_header Cookie $http_cookie;');
    }
  });
});

describe('nginx api subdomain routing', () => {
  it('routes marketplace api requests with auth and browser CORS support', () => {
    const config = readFileSync(apiConfigPath, 'utf8');
    const apiLocation = extractBlocks(config, /\blocation\s+\/api\/\s*\{/g)[0];

    expect(config).toContain('map $http_origin $cors_allow_origin');
    expect(config).toContain('"~^https://efbazaar\\.uz$" $http_origin;');
    expect(apiLocation).toContain('auth_basic off;');
    expect(apiLocation).toContain('auth_request /_auth_verify;');
    expect(apiLocation).toContain('error_page 401 = @marketplace_anon;');
    expect(apiLocation).toContain('add_header Access-Control-Allow-Origin $cors_allow_origin always;');
    expect(apiLocation).toContain('add_header Access-Control-Allow-Credentials "true" always;');
    expect(apiLocation).toContain('if ($request_method = OPTIONS)');
    // Variable-based upstream: re-resolved per request via the http-level
    // resolver, so container recreations don't leave nginx on a stale IP.
    expect(apiLocation).toContain('proxy_pass http://$backend_marketplace$request_uri;');
    expect(config).toContain('rewrite ^/api/(.*)$ /api/$1 break;');
  });

  it('aggregates OpenAPI JSON for every documented public backend service', () => {
    const apiConfig = readFileSync(apiConfigPath, 'utf8');
    const authApplication = readFileSync(authApplicationPath, 'utf8');

    for (const service of ['auth', 'marketplace', 'bot', 'trade', 'payment']) {
      expect(authApplication).toContain(`- name: ${service}`);
      expect(authApplication).toContain(`url: /v3/api-docs/${service}`);
      expect(apiConfig).toContain(`location = /v3/api-docs/${service}`);
    }

    expect(apiConfig).toContain('proxy_pass http://$backend_trade/v3/api-docs;');
    expect(apiConfig).toContain('proxy_pass http://$backend_payment/v3/api-docs;');
  });
});

describe('frontend internal API env', () => {
  it('documents the internal nginx SSR API endpoint', () => {
    const envExample = readFileSync(envExamplePath, 'utf8');

    expect(envExample).toContain('INTERNAL_API_BASE_URL=http://nginx:8080/api');
    expect(envExample).not.toContain('INTERNAL_API_BASE_URL=http://nginx/api');
    expect(envExample).not.toContain('INTERNAL_API_BASE_URL=https://api.efbazaar.uz');
  });
});

describe('authenticated chat WebSocket routing', () => {
  it('keeps cross-origin development access opt-in through the backend environment', () => {
    const compose = readFileSync(join(process.cwd(), '..', 'docker-compose.yml'), 'utf8');
    const marketplace = compose.match(/^  marketplace-service:\n[\s\S]*?(?=^  [a-z][a-z-]*:|$(?![\s\S]))/m)?.[0];
    expect(marketplace).toContain('CHAT_WEBSOCKET_ALLOWED_ORIGINS: ${CHAT_WEBSOCKET_ALLOWED_ORIGINS:-}');
    const example = readFileSync(join(process.cwd(), '..', '.env.example'), 'utf8');
    expect(example).toMatch(/^CHAT_WEBSOCKET_ALLOWED_ORIGINS=$/m);
    expect(example).toMatch(/^# CHAT_WEBSOCKET_ALLOWED_ORIGINS=http:\/\/localhost:3000$/m);
    expect(readFileSync(envExamplePath, 'utf8')).toContain('docs/superpowers/plans/2026-09-25-chat-websocket.md');
  });

  it('routes the public site, API host and internal proxy through the same protected handshake', () => {
    const site = readFileSync(configPath, 'utf8');
    const api = readFileSync(apiConfigPath, 'utf8');
    const routes = extractBlocks(site, /\blocation\s+=\s+\/ws\/chat\s*\{/g);
    expect(routes).toHaveLength(2);
    routes.push(...extractBlocks(api, /\blocation\s+=\s+\/ws\/chat\s*\{/g));
    expect(routes).toHaveLength(3);
    for (const route of routes) {
      expect(route).toContain('include /etc/nginx/conf.d/chat-websocket.inc;');
      expect(route).not.toMatch(/error_page|limit_req/);
    }
  });

  it('requires cookie authentication, overwrites identity and preserves the WebSocket upgrade', () => {
    const route = readFileSync(join(process.cwd(), '..', 'nginx', 'conf.d', 'chat-websocket.inc'), 'utf8');
    expect(route).toContain('auth_basic off;');
    expect(route).toContain('auth_request /_auth_verify;');
    expect(route).not.toMatch(/error_page|limit_req|\$http_x_user/);
    for (const [header, variable, source] of [
      ['X-User-Id', 'chat_user_id', 'x_user_id'],
      ['X-User-Roles', 'chat_user_roles', 'x_user_roles'],
      ['X-Telegram-Id', 'chat_telegram_id', 'x_telegram_id'],
      ['X-User-Name', 'chat_user_name', 'x_user_name'],
    ]) {
      expect(route).toMatch(new RegExp(`auth_request_set\\s+\\$${variable}\\s+\\$upstream_http_${source};`));
      expect(route).toMatch(new RegExp(`proxy_set_header\\s+${header}\\s+\\$${variable};`));
    }
    expect(route).toContain('proxy_pass http://$backend_marketplace/ws/chat;');
    expect(route).toContain('proxy_http_version 1.1;');
    expect(route).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(route).toContain('proxy_set_header Connection $connection_upgrade;');
    expect(route).toContain('proxy_set_header Cookie $http_cookie;');
    expect(route).toContain('proxy_set_header Host $http_host;');
    expect(route).toContain('proxy_set_header X-Forwarded-Host $http_host;');
    expect(route).toContain('proxy_buffering off;');
    expect(route).toContain('proxy_read_timeout 75s;');
  });
});

describe('nginx recommendation routing', () => {
  it('proxies /api/rec with optional auth and strips identity for anonymous calls', () => {
    const siteConfig = readFileSync(configPath, 'utf8');
    expect(siteConfig).toContain('location /api/rec/ {');
    expect(siteConfig).toContain('location @rec_anon {');
    expect(siteConfig).toContain('location @rec_anon_internal {');
    expect(siteConfig).not.toContain('recommendation_service_unavailable');
    const anon = siteConfig.slice(siteConfig.indexOf('location @rec_anon {'));
    expect(anon.slice(0, anon.indexOf('}'))).toContain('proxy_set_header X-User-Id     ""');
  });
});
