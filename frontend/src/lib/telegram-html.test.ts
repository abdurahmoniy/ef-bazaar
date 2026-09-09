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

describe('telegramHtmlToPreview — custom emoji', () => {
  const urls = new Map([['5332713063516753296', '/bot/emoji/FILE1']]);

  it('tanish emoji preview da harakatli video bo\'lib chiziladi', () => {
    // Panelda statik thumbnail, preview da esa asl fayl — admin xabar
    // qanday ko'rinishini haqiqiy holicha ko'rishi kerak.
    const html = telegramHtmlToPreview(
      '<tg-emoji emoji-id="5332713063516753296">🇵🇹</tg-emoji>',
      urls,
    );

    expect(html).toContain('<video');
    expect(html).toContain('/bot/emoji/FILE1');
  });

  it('notanish id zaxira emoji bilan qoladi', () => {
    // Telegram ham aynan shunday qiladi: emoji ko'rsatib bo'lmasa teg
    // ichidagi oddiy belgi chiqadi. Bo'sh qoldirsak, admin matnda teshik
    // ko'rib, nima yo'qolganini bilmasdi.
    const html = telegramHtmlToPreview('<tg-emoji emoji-id="999">🙂</tg-emoji>', urls);

    expect(html).not.toContain('<video');
    expect(html).toContain('🙂');
  });

  it('id shakli qat\'iy — atribut in\'ektsiyasi o\'tmaydi', () => {
    // id to'g'ridan-to'g'ri HTML atributiga tushmaydi, lekin u bilan
    // xarita qidiriladi. Shakl erkin bo'lsa, teg umuman tanilmasligi yoki
    // kutilmagan narsa chizilishi mumkin edi.
    const html = telegramHtmlToPreview(
      '<tg-emoji emoji-id="1" onerror=alert(1)">🙂</tg-emoji>',
      urls,
    );

    // Muhimi shu: soxta teg VIDEO'ga aylanmaydi va ekranlangan matn bo'lib
    // qoladi. "onerror" so'zining matn ichida ko'rinishi zararsiz — u
    // atribut emas, oddiy belgilar.
    expect(html).not.toContain('<video');
    expect(html).toContain('&lt;tg-emoji');
  });

  it('zaxira matn ekranlanadi', () => {
    const html = telegramHtmlToPreview('<tg-emoji emoji-id="999"><img src=x></tg-emoji>', urls);

    expect(html).not.toContain('<img');
  });

  it('xarita berilmasa ham yiqilmaydi', () => {
    // Preview boshqa joylarda ham ishlatiladi (hamkor post sozlamalari),
    // u yerda emoji xaritasi yo'q.
    const html = telegramHtmlToPreview('<b>qalin</b> <tg-emoji emoji-id="1">🙂</tg-emoji>');

    expect(html).toContain('<b>qalin</b>');
    expect(html).toContain('🙂');
  });
});


describe('telegramHtmlToPreview — havolalar', () => {
  it('xavfsiz havola haqiqiy <a> bo\'lib chiziladi', () => {
    // Ilgari faqat "javascript: bo'lmasin" deb tekshirilardi va u
    // havolalar umuman chizilmayotganida ham o'tardi.
    expect(telegramHtmlToPreview('<a href="https://efbazaar.uz">sayt</a>'))
      .toContain('<a href="https://efbazaar.uz"');
  });

  it('so\'rov parametrli havola ham chiziladi', () => {
    // `&` ekranlangandan keyin `&amp;` bo'ladi; eski naqsh o'sha yerda
    // to'xtardi.
    expect(telegramHtmlToPreview('<a href="https://efbazaar.uz/?a=1&b=2">x</a>'))
      .toContain('a=1&amp;b=2');
  });
});

describe('custom emoji — muharrir va saqlash orasida', () => {
  const urls = new Map([['5332713063516753296', '/bot/emoji/THUMB1']]);

  it('muharrirdagi emoji saqlashda <tg-emoji> ga aylanadi', () => {
    // Bu yo'l uzilsa emoji JIMGINA yo'qoladi: <img> da matn yo'q, ya'ni
    // "notanish element — matnini saqla" qoidasi hech narsa qoldirmaydi.
    const html = domToTelegramHtml(editor(
      '<img class="tg-emoji" data-emoji-id="5332713063516753296" data-fallback="🇵🇹" alt="🇵🇹">',
    ));

    expect(html).toBe('<tg-emoji emoji-id="5332713063516753296">🇵🇹</tg-emoji>');
  });

  it('saqlangan matn muharrirga qaytganda emoji ko\'rinadi', () => {
    const html = telegramHtmlToEditor(
      '<tg-emoji emoji-id="5332713063516753296">🇵🇹</tg-emoji>',
      urls,
    );

    expect(html).toContain('data-emoji-id="5332713063516753296"');
    expect(html).toContain('/bot/emoji/THUMB1');
  });

  it('borib-kelish matnni o\'zgartirmaydi', () => {
    // Admin xabarni tahrirlab, saqlab, qayta ochishi mumkin. Har aylanishda
    // shakl o'zgarsa, emoji bir necha tahrirdan keyin yo'qolardi.
    const original = 'salom <tg-emoji emoji-id="111">🙂</tg-emoji> xayr';
    const roundTripped = domToTelegramHtml(editor(telegramHtmlToEditor(original, new Map([['111', '/u']]))));

    expect(roundTripped).toBe(original);
  });

  it('notanish id bo\'lsa ham saqlashda id yo\'qolmaydi', () => {
    // Xaritada yo'q emoji muharrirda zaxira belgi bo'lib ko'rinadi, lekin
    // id saqlanishi kerak — aks holda tahrirlash uni o'chirib yuborardi.
    const editorHtml = telegramHtmlToEditor('<tg-emoji emoji-id="999">🙂</tg-emoji>', urls);
    expect(domToTelegramHtml(editor(editorHtml)))
      .toBe('<tg-emoji emoji-id="999">🙂</tg-emoji>');
  });
});

describe('custom emoji — zaxira belgi atribut chegarasini buzmaydi', () => {
  it('qo\'shtirnoqli zaxira atributdan chiqib keta olmaydi', () => {
    // `escapeHtml` qo'shtirnoqqa TEGMAYDI (faqat & < >). Zaxira matn esa
    // `data-fallback="..."` ichiga tushadi, ya'ni tirnoq chegarani yopib,
    // undan keyingi hamma narsa muharrir DOM'ida atributga aylanardi.
    const html = telegramHtmlToEditor(
      '<tg-emoji emoji-id="1">" onmouseover=alert(1) x="</tg-emoji>',
      new Map([['1', '/u']]),
    );

    // Matnda "onmouseover" so'zi KO'RINISHI zararsiz — muhimi, u atribut
    // bo'lib qolmasin. Shuning uchun natijani DOM sifatida o'qiymiz:
    // aynan brauzer nima ko'rishini tekshirgan bo'lamiz.
    const img = editor(html).querySelector('img');
    expect(img?.getAttribute('onmouseover')).toBeNull();
    expect(img?.getAttribute('data-fallback')).toContain('onmouseover');
  });
});

describe('preview — emoji poster bilan', () => {
  it('poster berilsa video uni ko\'rsatadi', () => {
    // Video yuklanmasa yoki brauzer uni chiza olmasa, `<video>` JIMGINA
    // bo'sh joy qoldiradi — xabar puffagi bo'm-bo'sh ko'rinadi va admin
    // nima yozganini ko'rmaydi. Poster statik kadr beradi: emoji darrov
    // ko'rinadi, video esa yuklangach jonlanadi.
    const html = telegramHtmlToPreview(
      '<tg-emoji emoji-id="1">🙂</tg-emoji>',
      new Map([['1', '/bot/emoji/FILE']]),
      new Map([['1', '/bot/emoji/THUMB']]),
    );

    expect(html).toContain('poster="/bot/emoji/THUMB"');
    expect(html).toContain('src="/bot/emoji/FILE"');
  });

  it('postersiz ham ishlaydi', () => {
    const html = telegramHtmlToPreview('<tg-emoji emoji-id="1">🙂</tg-emoji>',
      new Map([['1', '/u']]));

    expect(html).toContain('<video');
    expect(html).not.toContain('poster=');
  });
});
