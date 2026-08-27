// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  domToTelegramHtml,
  telegramHtmlToEditor,
  telegramHtmlToPreview,
  telegramTextLength,
} from './telegram-html';

function editor(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('domToTelegramHtml', () => {
  it('kanonik teglarga keltiradi', () => {
    // Brauzerlar bir xil formatlash uchun har xil teg beradi. Saqlangan matn
    // qaysi brauzerda yozilganiga bog'liq bo'lmasligi kerak.
    expect(domToTelegramHtml(editor('<strong>a</strong><em>b</em><del>c</del>')))
      .toBe('<b>a</b><i>b</i><s>c</s>');
  });

  it('notanish tegni tashlaydi, matnini saqlaydi', () => {
    // Word yoki saytdan nusxa ko'chirganda aynan shunday markup keladi.
    expect(domToTelegramHtml(editor('<span style="font-size:40px">salom</span>')))
      .toBe('salom');
    expect(domToTelegramHtml(editor('<font color="red"><b>qalin</b></font>')))
      .toBe('<b>qalin</b>');
  });

  it('script va style mazmunini matnga aylantirmaydi', () => {
    expect(domToTelegramHtml(editor('<style>.x{color:red}</style>matn')))
      .toBe('matn');
    expect(domToTelegramHtml(editor('<script>alert(1)</script>matn')))
      .toBe('matn');
  });

  it('<div> larni qator tashlashga aylantiradi', () => {
    // Chrome contenteditable ichida har qator uchun <div> yasaydi.
    expect(domToTelegramHtml(editor('birinchi<div>ikkinchi</div><div>uchinchi</div>')))
      .toBe('birinchi\nikkinchi\nuchinchi');
  });

  it('<br> ni qator tashlash deb oladi', () => {
    expect(domToTelegramHtml(editor('a<br>b'))).toBe('a\nb');
  });

  it('oxiridagi bo‘sh qatorlarni kesadi', () => {
    expect(domToTelegramHtml(editor('matn<div><br></div><div><br></div>'))).toBe('matn');
  });

  it('maxsus belgilarni ekranlaydi', () => {
    // Ekranlanmasa Telegram buni teg deb o'qiydi va xabarni rad etadi.
    expect(domToTelegramHtml(editor('<div></div>')).length).toBe(0);
    const el = document.createElement('div');
    el.textContent = 'a < b & c > d';
    expect(domToTelegramHtml(el)).toBe('a &lt; b &amp; c &gt; d');
  });

  it('spoilerni tg-spoiler ga aylantiradi', () => {
    expect(domToTelegramHtml(editor('<span class="tg-spoiler">sir</span>')))
      .toBe('<tg-spoiler>sir</tg-spoiler>');
  });

  it('xavfsiz havolani saqlaydi', () => {
    expect(domToTelegramHtml(editor('<a href="https://efbazaar.uz">sayt</a>')))
      .toBe('<a href="https://efbazaar.uz">sayt</a>');
  });

  it('javascript: havolasini tashlaydi, matnini qoldiradi', () => {
    expect(domToTelegramHtml(editor('<a href="javascript:alert(1)">bos</a>')))
      .toBe('bos');
  });
});

describe('telegramHtmlToEditor / Preview', () => {
  it('saqlangan matnni tahrirlagichga qaytaradi', () => {
    expect(telegramHtmlToEditor('<b>a</b>\nb')).toBe('<b>a</b><br>b');
  });

  it('aylanish matnni o‘zgartirmaydi', () => {
    // Saqlash → yuklash → saqlash bir xil natija berishi kerak, aks holda
    // admin hech narsa tegmasa ham matn asta-sekin buziladi.
    const original = '<b>efBazaar</b> — bozor\n<i>qatori</i>';
    const roundTripped = domToTelegramHtml(editor(telegramHtmlToEditor(original)));
    expect(roundTripped).toBe(original);
  });

  it('preview ruxsatsiz tegni ko‘rsatmaydi', () => {
    const html = telegramHtmlToPreview('<img src=x onerror=alert(1)><b>ok</b>');
    expect(html).not.toContain('<img');
    expect(html).toContain('<b>ok</b>');
  });

  it('preview javascript: havolasini bosiladigan qilmaydi', () => {
    const html = telegramHtmlToPreview('<a href="javascript:alert(1)">bos</a>');
    expect(html).not.toContain('<a href="javascript:');
  });
});

describe('telegramTextLength', () => {
  it('teglarni sanamaydi', () => {
    expect(telegramTextLength('<b>abc</b>')).toBe(3);
    expect(telegramTextLength('<a href="https://efbazaar.uz">ab</a>')).toBe(2);
  });

  it('surrogat juftlikli emojini ikki birlik deb sanaydi', () => {
    expect(telegramTextLength('\u{1F4CB}')).toBe(2);
  });

  it('BMP emojisini bitta birlik deb sanaydi', () => {
    expect(telegramTextLength('⚽')).toBe(1);
  });
});
