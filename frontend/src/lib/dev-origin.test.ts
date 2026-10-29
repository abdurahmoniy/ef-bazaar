import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { blockCrossSiteDEV } from 'next/dist/server/lib/router-utils/block-cross-site-dev';
import { describe, expect, it } from 'vitest';

const { default: config } = await import(pathToFileURL(join(process.cwd(), 'next.config.mjs')).href);

function checkDevelopmentOrigin(origin: string) {
  const request = new IncomingMessage(new Socket());
  request.url = '/_next/webpack-hmr';
  request.headers.origin = origin;
  const response = new ServerResponse(request);

  const blocked = blockCrossSiteDEV(request, response, config.allowedDevOrigins, '127.0.0.1');
  return { blocked, status: response.statusCode };
}

describe('development tunnel origin protection', () => {
  it('allows the efBazaar tunnel to connect to the development WebSocket', () => {
    expect(checkDevelopmentOrigin('https://efbazaar.ochq.uz').blocked).toBe(false);
  });

  it('continues to allow the loopback development origin', () => {
    expect(checkDevelopmentOrigin('http://127.0.0.1:3001').blocked).toBe(false);
  });

  it.each(['https://other.ochq.uz', 'https://efbazaar.ochq.uz.example.com'])(
    'rejects the unrelated origin %s',
    (origin) => {
      expect(checkDevelopmentOrigin(origin)).toEqual({ blocked: true, status: 403 });
    },
  );
});
