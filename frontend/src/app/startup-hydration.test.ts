// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type * as Typescript from 'typescript';
import { act, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ThemeToggle } from '@/components/theme/theme-toggle';

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  document.body.replaceChildren();
  document.querySelectorAll('script[src*="telegram.org"]').forEach(script => script.remove());
  document.documentElement.classList.remove('dark');
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('hydrates the theme control while third-party startup requests remain pending', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const ts: typeof Typescript = createRequire(import.meta.url)('typescript');
  const source = ts.createSourceFile('layout.tsx', readFileSync('src/app/layout.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const scripts: Array<[string, Record<string, string>]> = [];
  const visit = (node: Typescript.Node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === 'Script') {
      const props: Record<string, string> = {};
      for (const prop of node.attributes.properties) {
        if (ts.isJsxAttribute(prop) && prop.initializer && ts.isStringLiteral(prop.initializer)) {
          props[prop.name.getText(source)] = prop.initializer.text;
        }
      }
      if (props.src && props.strategy === 'beforeInteractive') scripts.push([props.src, {}]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  // Exercise the installed Next runtime with the real layout's startup queue.
  // jsdom deliberately never completes these external script downloads.
  vi.stubGlobal('self', window);
  (window as unknown as { __next_s: typeof scripts }).__next_s = scripts;
  const runtime = document.createElement('script');
  runtime.src = 'http://localhost/_next/static/chunks/test-runtime.js';
  vi.spyOn(document, 'currentScript', 'get').mockReturnValue(runtime);
  const { appBootstrap } = createRequire(import.meta.url)('next/dist/client/app-bootstrap.js');
  const container = document.createElement('div');
  container.innerHTML = renderToString(createElement(ThemeToggle));
  document.body.append(container);
  await act(async () => appBootstrap(() => { root = hydrateRoot(container, createElement(ThemeToggle)); }));
  await act(async () => container.querySelector('button')!.click());
  expect(document.documentElement.classList.contains('dark')).toBe(true);
});
