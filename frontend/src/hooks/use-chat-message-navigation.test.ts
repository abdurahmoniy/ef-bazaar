// @vitest-environment jsdom

import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatMessageNavigation } from './use-chat-message-navigation';

describe('message navigation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let navigation: ReturnType<typeof useChatMessageNavigation>;
  let reducedMotion = false;
  const stopFollowing = vi.fn();
  const scrollIntoView = vi.fn();
  const specialId = 'quote"[]#';

  function Harness() {
    const listRef = useRef<HTMLDivElement>(null);
    navigation = useChatMessageNavigation(listRef, stopFollowing);
    return createElement('div', null,
      createElement('div', { 'data-message-id': 'outside' }),
      createElement('div', { ref: listRef },
        createElement('div', { 'data-message-id': specialId }),
        createElement('div', { 'data-message-id': 'second' })));
  }

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers();
    reducedMotion = false;
    stopFollowing.mockReset();
    scrollIntoView.mockReset();
    vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: scrollIntoView, configurable: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(Harness)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('safely finds an exact ID, stops following, and centers the message', async () => {
    let found = false;
    await act(async () => { found = navigation.jumpToMessage(specialId); });
    expect(found).toBe(true);
    expect(stopFollowing).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(navigation.highlightedMessageId).toBe(specialId);
    expect(stopFollowing.mock.invocationCallOrder[0]).toBeLessThan(scrollIntoView.mock.invocationCallOrder[0]);
  });

  it('never navigates outside the current chat or falsely highlights a missing message', async () => {
    expect(navigation.jumpToMessage('outside')).toBe(false);
    expect(navigation.jumpToMessage('deleted')).toBe(false);
    expect(stopFollowing).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(navigation.highlightedMessageId).toBeNull();
  });

  it('honors reduced motion', async () => {
    reducedMotion = true;
    await act(async () => { navigation.jumpToMessage('second'); });
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'center' });
  });

  it('restarts the highlight timeout on the next jump and cleans it up on unmount', async () => {
    await act(async () => { navigation.jumpToMessage(specialId); });
    await act(async () => { vi.advanceTimersByTime(1000); navigation.jumpToMessage('second'); });
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(navigation.highlightedMessageId).toBe('second');
    await act(async () => { vi.advanceTimersByTime(900); });
    expect(navigation.highlightedMessageId).toBeNull();
    await act(async () => { navigation.jumpToMessage('second'); root.render(null); });
    expect(vi.getTimerCount()).toBe(0);
  });
});
