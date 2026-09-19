// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/marketplace' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

import { ClientQueryProvider } from './client-query-provider';
import { chatKeys } from '@/lib/chat-cache';

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

function Probe() {
  client = useQueryClient();
  return null;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  route.pathname = '/marketplace';
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

async function navigate(pathname: string) {
  route.pathname = pathname;
  await act(async () => root.render(createElement(ClientQueryProvider, null, createElement(Probe))));
}

it.each(['/', '/auth/login'])('clears private data on the logout/auth destination %s', async pathname => {
  await navigate('/marketplace');
  client.setQueryData(chatKeys.messages('viewer', 'chat'), ['private']);
  client.setQueryData(['public', 'listings'], ['public']);
  await navigate('/chats');
  expect(client.getQueryData(chatKeys.messages('viewer', 'chat'))).toEqual(['private']);
  await navigate(pathname);
  expect(client.getQueryData(chatKeys.messages('viewer', 'chat'))).toBeUndefined();
  expect(client.getQueryData(['public', 'listings'])).toEqual(['public']);
});
