/**
 * Telegram HTML bilan brauzer DOM'i orasidagi tarjimon.
 *
 * NEGA BU ALOHIDA MODUL. Tahrirlagich `contenteditable` ustida ishlaydi va
 * brauzer u yerga o'z markupini qo'shadi: `<div>`, `<span style="...">`,
 * `<font color>`, `<meta>` — ayniqsa boshqa saytdan yoki Word'dan nusxa
 * ko'chirilganda. Agar shu markup to'g'ridan-to'g'ri saqlansa, Telegram
 * "can't parse entities" deb BUTUN xabarni rad etadi va /start hech kimga
 * ishlamay qoladi.
 *
 * Shuning uchun bu yerdagi hamma narsa RUXSATNOMA ro'yxati asosida ishlaydi:
 * avval hech narsaga ishonilmaydi, keyin ma'lum teglar qaytariladi. Teskarisi
 * — "xavflilarini olib tashlash" — yozgan har kim bittasini unutadi.
 */

/** Telegram qo'llab-quvvatlaydigan teglar (rasmiy ro'yxat). */
export const TELEGRAM_TAGS = [
  'b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del',
  'a', 'code', 'pre', 'blockquote', 'span', 'tg-spoiler',
] as const;

/**
 * Brauzer chiqaradigan teg → Telegram tegi.
 *
 * Brauzerlar bir xil formatlash uchun har xil teg beradi: Chrome `<b>`,
 * ba'zi holatlarda `<strong>`. Ikkalasini ham bitta kanonik shaklga
 * keltiramiz, shunda saqlangan matn brauzerga bog'liq bo'lmaydi.
 */
const TAG_MAP: Record<string, string> = {
  b: 'b', strong: 'b',
  i: 'i', em: 'i',
  u: 'u', ins: 'u',
  s: 's', strike: 's', del: 's',
  code: 'code',
  pre: 'pre',
  blockquote: 'blockquote',
  a: 'a',
  'tg-spoiler': 'tg-spoiler',
};

/** Yopilgandan keyin qator tashlaydigan elementlar. */
const BLOCK_TAGS = new Set(['div', 'p', 'blockquote', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Havola xavfsizmi. `javascript:` va `data:` sxemalari tahrirlagich orqali
 * kirib qolmasin — Telegram ularni baribir rad etadi, lekin preview HTML'ida
 * ular bizning admin sahifamizda ishga tushishi mumkin edi.
 */
function safeHref(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed) || /^tg:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function isSpoiler(el: Element): boolean {
  return el.tagName.toLowerCase() === 'tg-spoiler' || el.classList.contains('tg-spoiler');
}

/**
 * DOM → Telegram HTML. Tahrirlagichdan saqlashga chiqadigan yagona yo'l.
 *
 * <p>`innerHTML` HECH QACHON to'g'ridan-to'g'ri olinmaydi: daraxt aylanib
 * chiqiladi va faqat {@link TAG_MAP} dagi teglar chiqariladi. Notanish
 * element tashlanadi, lekin uning MATNI saqlanadi — admin yozgan gap
 * yo'qolib qolmasligi kerak.
 */
export function domToTelegramHtml(root: HTMLElement): string {
  let out = '';

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += escapeHtml(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      out += '\n';
      return;
    }

    // Ko'rinmaydigan elementlar matn bermaydi — nusxa ko'chirishda kelib
    // qolgan <style>/<script> mazmuni matnga aylanib ketmasin.
    if (tag === 'style' || tag === 'script' || tag === 'meta') return;

    if (isSpoiler(el)) {
      out += '<tg-spoiler>';
      el.childNodes.forEach(walk);
      out += '</tg-spoiler>';
      return;
    }

    if (tag === 'a') {
      const href = safeHref(el.getAttribute('href'));
      if (href) {
        out += `<a href="${escapeHtml(href)}">`;
        el.childNodes.forEach(walk);
        out += '</a>';
        return;
      }
      // Havolasiz <a> — teg tashlanadi, matn qoladi.
      el.childNodes.forEach(walk);
      return;
    }

    const mapped = TAG_MAP[tag];
    if (mapped) {
      out += `<${mapped}>`;
      el.childNodes.forEach(walk);
      out += `</${mapped}>`;
      if (BLOCK_TAGS.has(tag)) out += '\n';
      return;
    }

    // Notanish element: o'zi tashlanadi, ichidagi saqlanadi.
    const needsBreak = BLOCK_TAGS.has(tag) && out.length > 0 && !out.endsWith('\n');
    if (needsBreak) out += '\n';
    el.childNodes.forEach(walk);
    if (BLOCK_TAGS.has(tag) && !out.endsWith('\n')) out += '\n';
  };

  root.childNodes.forEach(walk);

  // contenteditable oxiriga qo'shib qo'yadigan bo'sh qatorlarni kesamiz.
  return out.replace(/\n+$/, '');
}

/**
 * Telegram HTML → tahrirlagich DOM'i uchun HTML.
 *
 * <p>Ikkita farq bor: qator tashlash `\n` emas `<br>` bo'lishi kerak, va
 * `<tg-spoiler>` brauzerda notanish element — uni `<span>` ga aylantiramiz,
 * shunda uslub berish va kursor bilan ishlash normal ishlaydi.
 */
export function telegramHtmlToEditor(html: string): string {
  return sanitizeTelegramHtml(html, { spoilerAsSpan: true }).replace(/\n/g, '<br>');
}

/**
 * Preview uchun xavfsiz HTML. Kirish ishonchsiz deb qaraladi — u admin
 * yozayotgan, hali saqlanmagan va tekshirilmagan matn.
 */
export function telegramHtmlToPreview(html: string): string {
  return sanitizeTelegramHtml(html, { spoilerAsSpan: true }).replace(/\n/g, '<br>');
}

/**
 * Matnni HTML sifatida qayta quradi: avval hammasi ekranlanadi, keyin faqat
 * ruxsat etilgan teglar tiklanadi. Shuning uchun kirish qanchalik yomon
 * bo'lsa ham chiqishda faqat ma'lum teglar bo'ladi.
 */
function sanitizeTelegramHtml(html: string, opts: { spoilerAsSpan: boolean }): string {
  const escaped = escapeHtml(html);

  // Atributsiz teglar
  let result = escaped.replace(
    /&lt;(\/?)(b|strong|i|em|u|ins|s|strike|del|code|pre|blockquote|tg-spoiler)&gt;/g,
    (_m, slash: string, tag: string) => {
      const lower = tag.toLowerCase();
      if (lower === 'tg-spoiler' && opts.spoilerAsSpan) {
        return slash ? '</span>' : '<span class="tg-spoiler">';
      }
      return `<${slash}${TAG_MAP[lower] ?? lower}>`;
    },
  );

  // <a href="..."> — faqat xavfsiz sxema bilan
  result = result.replace(
    /&lt;a\s+href=&quot;([^&]*)&quot;\s*&gt;/gi,
    (match, href: string) => {
      const safe = safeHref(href.replace(/&amp;/g, '&'));
      return safe ? `<a href="${escapeHtml(safe)}" target="_blank" rel="noreferrer">` : match;
    },
  );
  result = result.replace(/&lt;\/a&gt;/gi, '</a>');

  return result;
}

/**
 * Telegram sanaydigan uzunlik: teglarsiz, UTF-16 birliklarida.
 *
 * <p>JS satrlari UTF-16 da saqlanadi, ya'ni `.length` aynan Telegram
 * kutgan sonni beradi. `📋` kabi surrogat juftlikli emoji ikkita birlik,
 * `⚽` esa bitta — "emoji har doim ikkita" degan taxmin noto'g'ri.
 */
export function telegramTextLength(html: string): number {
  return html.replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(\s[^>]*)?>/g, '').length;
}
