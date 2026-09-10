// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupportPageContainer } from './support-page-container';
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
  it('prefills an editable trade request without submitting it', async () => {
    await act(async () => {
      root.render(createElement(SupportNewChatForm, {
        user: null, initialMessage: 'Steam /marketplace/listing-1 /chats/chat-1', onChatCreated: vi.fn(),
      }));
    });
    expect(container.querySelector('textarea')!.value).toContain('/marketplace/listing-1');
    expect(supportApi.createSupportChat).not.toHaveBeenCalled();
  });

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
  it('prefills the existing support chat without sending automatically', async () => {
    const chat: supportApi.SupportChat = {
      id: 'existing', category: 'SUPPORT', status: 'OPEN', senderName: 'Buyer',
      messages: [], lastMessageAt: '', createdAt: '',
    };
    await act(async () => {
      root.render(createElement(SupportChatView, {
        initialChat: chat, initialMessage: 'PlayStation trade /chats/chat-2',
      }));
    });
    expect(container.querySelector('textarea')!.value).toContain('/chats/chat-2');
    expect(supportApi.sendSupportMessage).not.toHaveBeenCalled();
    expect(supportApi.createSupportChat).not.toHaveBeenCalled();
  });

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

describe('trade support handoff lifecycle', () => {
  it('consumes the draft when a new support conversation is created', async () => {
    vi.mocked(supportApi.getActiveSupportChat).mockResolvedValue(null);
    vi.mocked(supportApi.createSupportChat).mockResolvedValue({
      id: 'new', category: 'SUPPORT', status: 'OPEN', senderName: 'Buyer',
      messages: [], createdAt: '', lastMessageAt: '',
    });
    await act(async () => {
      root.render(createElement(SupportPageContainer, {
        user: { id: 'buyer', displayName: 'Buyer' } as any,
        initialCategory: 'SUPPORT', initialMessage: 'Steam trade request',
      }));
    });
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(supportApi.createSupportChat).toHaveBeenCalledWith(expect.objectContaining({ message: 'Steam trade request' }));
    expect(container.querySelector('textarea')!.value).toBe('');
  });
});
