// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { MessageDetail } from '@/lib/mail-types';
import { MessageView } from './message-view';

vi.mock('@/components/mail/message-hotkeys', () => ({ MessageHotkeys: () => null }));
vi.mock('@/lib/mail-server', () => ({ attachmentDownloadUrl: vi.fn() }));

const message: MessageDetail = {
  messageId: '42', subject: 'Message', fromName: 'Sender', fromAddress: 'sender@example.com',
  toAddresses: ['owner@efbazaar.uz'], ccAddresses: [], receivedAt: '2026-10-16T06:00:00Z',
  bodyHtml: null, bodyPlain: null, attachments: [], seen: true,
};

function reader(body: Partial<MessageDetail>) {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(createElement(MessageView, {
    mailboxId: 'mailbox-1', message: { ...message, ...body },
  }));
  return container.querySelector('article')!;
}

function messageBody(article: HTMLElement) {
  return article.querySelector<HTMLElement>('.mail-html-body, .mail-plain-body, pre')!;
}

describe('message body display', () => {
  it.each(['plain', 'html', 'linked HTML'])('preserves the full destination and accessible text for long URLs in %s', (format) => {
    const url = 'https://example.com/reset?token=' + 'abcdef'.repeat(80) + '&language=uz';
    const encoded = url.replaceAll('&', '&amp;');
    const body = messageBody(reader(format === 'plain' ? { bodyPlain: url } : {
      bodyHtml: format === 'html' ? `<p>${encoded}</p>`
        : `<a href="${encoded}" target="_blank" rel="noopener noreferrer">${encoded}</a>`,
    }));
    const link = body.querySelector('a')!;
    expect(link.getAttribute('href')).toBe(url);
    expect(link.textContent).toBe(url);
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
  });

  it('preserves entity-like URL parameters in plain-text links', () => {
    const url = 'https://example.com/?token=a&notin;=2&copy;=3';
    const body = messageBody(reader({ bodyPlain: url }));
    expect(body.querySelector('a')?.getAttribute('href')).toBe(url);
    expect(body.textContent).toBe(url);
  });

  it('decodes HTML entities exactly once in bare URLs and existing links', () => {
    const url = 'https://example.com/?token=a&notin;=2&copy;=3';
    const encodedUrl = url.replaceAll('&', '&amp;');
    const body = messageBody(reader({
      bodyHtml: `<p>${encodedUrl}</p><a href="${encodedUrl}" target="_blank" rel="noopener noreferrer">&amp;lt;tag&amp;gt;</a>`,
    }));
    const links = body.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe(url);
    expect(links[0].textContent).toBe(url);
    expect(links[1].getAttribute('href')).toBe(url);
    expect(links[1].textContent).toBe('&lt;tag&gt;');
  });

  it('preserves Unicode and literal entity text in formatted HTML', () => {
    const body = messageBody(reader({ bodyHtml: '<p>&#128075; &amp;copy; &copy; &amp;amp;</p>' }));
    expect(body.textContent).toBe('👋 &copy; © &amp;');
  });

  it('makes web URLs and email addresses clickable in plain text', () => {
    const text = 'Open https://example.com/reset?token=abc&lang=en\n'
      + '  Or http://example.com/help, www.example.com and example.org.\n'
      + 'Contact support@example.com';
    const body = messageBody(reader({ bodyPlain: text }));
    expect(body.textContent).toBe(text);
    expect(Array.from(body.querySelectorAll('a'), (a) => a.getAttribute('href'))).toEqual([
      'https://example.com/reset?token=abc&lang=en', 'http://example.com/help',
      'https://www.example.com', 'https://example.org', 'mailto:support@example.com',
    ]);
    for (const link of body.querySelectorAll('a')) {
      expect(link.target).toBe('_blank');
      expect(link.rel.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    }
  });

  it('keeps surrounding punctuation out of URLs and balanced parentheses inside them', () => {
    const text = 'See (https://example.com/reset?token=abc), then https://example.com/wiki/Foo_(bar).';
    const body = messageBody(reader({ bodyPlain: text }));
    expect(body.textContent).toBe(text);
    expect(Array.from(body.querySelectorAll('a'), (a) => a.getAttribute('href'))).toEqual([
      'https://example.com/reset?token=abc', 'https://example.com/wiki/Foo_(bar)',
    ]);
  });

  it('renders HTML formatting and existing links while linking bare URLs in text nodes', () => {
    // Mirrors the backend contract: HTML is already sanitised by Jsoup.
    const html = '<p><strong>Hello</strong> https://example.com/reset?token=abc&amp;lang=en</p>'
      + '<a href="https://example.com/original" target="_blank" rel="noopener noreferrer">www.example.com</a>'
      + '<ul><li>Item</li></ul><table><tbody><tr><td>Cell</td></tr></tbody></table>';
    const article = reader({ bodyHtml: html, bodyPlain: 'Plain alternative' });
    const body = messageBody(article);
    expect(body.querySelector('strong')?.textContent).toBe('Hello');
    expect(body.querySelector('li')?.textContent).toBe('Item');
    expect(body.querySelector('td')?.textContent).toBe('Cell');
    const links = body.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('https://example.com/reset?token=abc&lang=en');
    expect(links[0].target).toBe('_blank');
    expect(links[0].rel).toBe('noopener noreferrer');
    expect(links[1].getAttribute('href')).toBe('https://example.com/original');
    expect(links[1].textContent).toBe('www.example.com');
    expect(body.querySelector('a a')).toBeNull();
    expect(article.textContent).not.toContain('Plain alternative');
  });

  it('leaves URLs in HTML code samples alone', () => {
    const body = messageBody(reader({
      bodyHtml: '<pre>https://example.com/pre</pre><code>https://example.com/code</code>'
        + '<p>https://example.com/open</p>',
    }));
    expect(body.querySelector('pre a, code a')).toBeNull();
    expect(body.querySelector('p a')?.getAttribute('href')).toBe('https://example.com/open');
  });

  it('keeps plain-text markup and entities literal, even when they resemble an HTML email', () => {
    const text = '<script>alert(1)</script> <img src=x onerror=alert(1)>\n'
      + '<a href="https://example.com/?a=1&b=2">link</a> &amp;';
    const body = messageBody(reader({ bodyPlain: text }));
    expect(body.textContent).toBe(text);
    expect(body.querySelector('script, img, iframe, [onerror]')).toBeNull();
    for (const link of body.querySelectorAll('a')) {
      expect(link.getAttributeNames().sort()).toEqual(['href', 'rel', 'target']);
    }
  });

  it('does not create links for executable, data, or FTP schemes', () => {
    const text = 'javascript:alert(1) data:text/html,<b>hi</b> ftp://example.com/file';
    const body = messageBody(reader({ bodyPlain: text }));
    expect(body.textContent).toBe(text);
    expect(body.querySelectorAll('a')).toHaveLength(0);
  });

  it('does not turn escaped HTML in the HTML alternative back into executable markup', () => {
    const body = messageBody(reader({
      bodyHtml: '<p>&lt;img src=x onerror=alert(1)&gt; https://example.com</p>',
    }));
    expect(body.querySelector('img, [onerror]')).toBeNull();
    expect(body.textContent).toBe('<img src=x onerror=alert(1)> https://example.com');
  });

  it('falls back to plain text when the HTML alternative is blank', () => {
    const body = messageBody(reader({ bodyHtml: ' \n ', bodyPlain: 'https://example.com' }));
    expect(body.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
  });

  it('shows the existing empty state when neither alternative is available', () => {
    expect(reader({ bodyHtml: null, bodyPlain: ' ' }).textContent)
      .toContain('Xat matnini ko\'rsatib bo\'lmadi.');
  });
});
