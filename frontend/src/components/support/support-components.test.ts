// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupportNewChatForm } from './support-new-chat-form';
import { SupportChatView } from './support-chat-view';
import { SupportWidget } from './support-widget';
import * as supportApi from '@/lib/support';

vi.mock('@/lib/support', async () => {
  const actual = await vi.importActual<typeof import('@/lib/support')>('@/lib/support');
  return {
    ...actual,
    createSupportChat: vi.fn(),
    getActiveSupportChat: vi.fn().mockResolvedValue(null),
    getSupportChat: vi.fn(),
    sendSupportMessage: vi.fn(),
    closeSupportChat: vi.fn(),
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('SupportNewChatForm', () => {
  it('renders category options and submits new chat', async () => {
    const onCreated = vi.fn();
    const user = { id: 'u-1', displayName: 'Alisher Test' } as any;

    await act(async () => {
      root.render(
        createElement(SupportNewChatForm, {
          user,
          initialCategory: 'PARTNERSHIP',
          onChatCreated: onCreated,
        })
      );
    });

    expect(container.textContent).toContain('Hamkorlik');
    expect(container.textContent).toContain('Texnik yordam');

    const textarea = container.querySelector('textarea')!;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    await act(async () => {
      nativeSetter?.call(textarea, 'Hamkorlik taklifi');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });

    vi.mocked(supportApi.createSupportChat).mockResolvedValueOnce({
      id: 'chat-10',
      category: 'PARTNERSHIP',
      status: 'OPEN',
      senderName: 'Alisher Test',
      messages: [],
      lastMessageAt: '2026-09-09T10:00:00Z',
      createdAt: '2026-09-09T10:00:00Z',
    });

    const form = container.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(supportApi.createSupportChat).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'PARTNERSHIP',
        message: 'Hamkorlik taklifi',
      })
    );
  });
});

describe('SupportChatView', () => {
  it('renders chat messages with user and admin sender styles', async () => {
    const mockChat: supportApi.SupportChat = {
      id: 'chat-1',
      category: 'SUPPORT',
      status: 'REPLIED',
      senderName: 'Alisher',
      messages: [
        {
          id: 'm-1',
          supportChatId: 'chat-1',
          senderType: 'USER',
          senderName: 'Alisher',
          content: 'Yordam kerak',
          createdAt: '2026-09-09T10:00:00Z',
        },
        {
          id: 'm-2',
          supportChatId: 'chat-1',
          senderType: 'ADMIN',
          senderName: 'Admin Bot',
          content: 'Assalomu alaykum, qanday yordam bera olamiz?',
          createdAt: '2026-09-09T10:02:00Z',
        },
      ],
      lastMessageAt: '2026-09-09T10:02:00Z',
      createdAt: '2026-09-09T10:00:00Z',
    };

    await act(async () => {
      root.render(createElement(SupportChatView, { initialChat: mockChat }));
    });

    expect(container.textContent).toContain('Yordam kerak');
    expect(container.textContent).toContain('Assalomu alaykum, qanday yordam bera olamiz?');
    expect(container.textContent).toContain('Javob berildi');
  });
});

describe('SupportWidget', () => {
  it('renders floating button and opens modal when clicked', async () => {
    await act(async () => {
      root.render(createElement(SupportWidget, { user: null }));
    });

    const button = container.querySelector('button[aria-label="Qo‘llab-quvvatlash chati"]') as HTMLButtonElement;
    expect(button).not.toBeNull();

    await act(async () => {
      button.click();
    });

    expect(container.textContent).toContain('efBazaar Qo‘llab-quvvatlash');
    expect(container.textContent).toContain('Murojaat yo‘nalishi');
  });
});
