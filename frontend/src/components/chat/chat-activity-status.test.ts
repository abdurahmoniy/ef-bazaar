import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ChatActivityStatus, MessageReadReceipt } from './chat-activity-status';
it('shows typing ahead of online and uses animated dots', () => {
  const html = renderToStaticMarkup(createElement(ChatActivityStatus, { activity: { online: true, typing: true, lastSeenAt: null, lastReadAt: null } }));
  expect(html).toContain('yozmoqda'); expect(html).toContain('chat-typing-dot');
});
it('does not label unknown connection state as offline', () => {
  const html = renderToStaticMarkup(createElement(ChatActivityStatus, { activity: null }));
  expect(html).not.toContain('Oflayn'); expect(html).toContain('Savdo suhbati');
});
it.each([null, '2026-09-24T09:59:59Z', '2026-09-24T10:00:00Z'])('renders authoritative read state from cursor %s', lastReadAt => {
  const html = renderToStaticMarkup(createElement(MessageReadReceipt, { createdAt: '2026-09-24T10:00:00Z', lastReadAt }));
  expect(html).toContain(lastReadAt === '2026-09-24T10:00:00Z' ? 'O‘qilgan' : 'Yuborilgan');
});
