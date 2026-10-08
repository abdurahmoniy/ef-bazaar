// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { chatPlainText, chatTextParts, customEmojiToken, serializeChatEditor } from './chat-custom-emoji';

describe('chat custom emoji protocol', () => {
  it('preserves emoji IDs in stored text and produces readable previews', () => {
    const token = customEmojiToken({ customEmojiId: '123', emoji: '⚽' });
    expect(chatTextParts(`Goal ${token}!`)).toEqual([{ text: 'Goal ' }, { emojiId: '123', text: '⚽' }, { text: '!' }]);
    expect(chatPlainText(`Goal ${token}!`)).toBe('Goal ⚽!');
  });
  it('treats HTML and malformed emoji tokens as plain text', () => {
    const unsafe = '<img src=x onerror=alert(1)><tg-emoji emoji-id="abc">⚽</tg-emoji>';
    expect(chatTextParts(unsafe)).toEqual([{ text: unsafe }]);
  });
  it('serializes inline images, text and line breaks without keeping pasted formatting', () => {
    const editor = document.createElement('div');
    editor.innerHTML = 'Hi <img data-emoji-id="123" alt="⚽"><br><b>Goal</b>';
    expect(serializeChatEditor(editor)).toBe('Hi <tg-emoji emoji-id="123">⚽</tg-emoji>\nGoal');
  });
});
