'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bold, Code, Eraser, EyeOff, Italic, Link2, Smile, Strikethrough, Underline } from 'lucide-react';

import { EmojiPicker } from '@/components/admin/emoji-picker';
import type { EmojiItem, EmojiPackDetail } from '@/lib/emoji-packs';
import { domToTelegramHtml, telegramHtmlToEditor } from '@/lib/telegram-html';
import { cn } from '@/lib/utils';

interface TelegramEditorProps {
  value: string;
  onChange: (telegramHtml: string) => void;
  className?: string;
  /** Berilsa, asboblar panelida emoji tugmasi paydo bo'ladi. */
  emojiPacks?: EmojiPackDetail[];
  /** custom_emoji_id → thumbnail manzili; saqlangan matnni chizish uchun. */
  emojiUrls?: ReadonlyMap<string, string>;
}

interface ToolbarAction {
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  run: () => void;
}

/**
 * Telegram xabar yozish maydonining muqobili.
 *
 * <p>Admin bu yerda HTML yozmaydi — qalin matn qalin bo'lib ko'rinadi.
 * Saqlashga esa Telegram HTML'i chiqadi, uni {@link domToTelegramHtml}
 * hosil qiladi.
 *
 * <p>{@code document.execCommand} eskirgan deb belgilangan, lekin barcha
 * brauzerlarda ishlaydi va uning o'rnini bosadigan standart hali yo'q.
 * Uning o'rniga Selection/Range bilan qo'lda ishlash — bekor qilish
 * (undo) tarixini buzadi, chunki brauzer o'z tarixiga faqat execCommand
 * o'zgarishlarini yozadi.
 */
export function TelegramEditor({
  value, onChange, className, emojiPacks, emojiUrls,
}: TelegramEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Oxirgi o'zimiz chiqargan qiymat. Bu bo'lmasa React qaytargan `value`
  // har bosishda innerHTML'ni qayta yozardi va kursor matn boshiga sakrardi.
  const lastEmitted = useRef<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === lastEmitted.current) return;
    el.innerHTML = telegramHtmlToEditor(value, emojiUrls);
  }, [value, emojiUrls]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const html = domToTelegramHtml(el);
    lastEmitted.current = html;
    onChange(html);
  }, [onChange]);

  const exec = useCallback((command: string, arg?: string) => {
    ref.current?.focus();
    // `false` — formatlash <span style> emas, TEG sifatida yozilsin.
    // Standart holatda ba'zi brauzerlar CSS ishlatadi va o'shanda
    // serializator qalin matnni tanimay qolardi.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false, arg);
    emit();
  }, [emit]);

  /**
   * Spoiler va `code` uchun execCommand'da buyruq yo'q — tanlangan matnni
   * qo'lda o'raymiz.
   */
  const wrapSelection = useCallback((tagName: string, className?: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (range.collapsed) return;

    const wrapper = document.createElement(tagName);
    if (className) wrapper.className = className;
    try {
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
      selection.removeAllRanges();
      const after = document.createRange();
      after.selectNodeContents(wrapper);
      selection.addRange(after);
    } catch {
      // Tanlov bir nechta elementni kesib o'tsa surroundContents yiqiladi.
      // Bunda hech narsa qilmaymiz — matn buzilmagani muhimroq.
      return;
    }
    emit();
  }, [emit]);

  /**
   * Emoji'ni kursorga qo'yadi.
   *
   * <p>`insertHTML` — Range bilan qo'lda qo'yish emas: brauzer o'z bekor
   * qilish tarixiga faqat execCommand o'zgarishlarini yozadi, qo'lda
   * qo'yilgani esa Ctrl+Z bilan qaytmasdi.
   *
   * <p>`data-emoji-id` shu yerda muhim: saqlashda aynan shundan
   * `<tg-emoji>` yasaladi. Usiz emoji jimgina yo'qolardi — rasmda matn yo'q.
   */
  const insertEmoji = useCallback((item: EmojiItem) => {
    const el = ref.current;
    if (!el) return;
    el.focus();

    const selection = window.getSelection();
    if (selection && (selection.rangeCount === 0 || !el.contains(selection.anchorNode))) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    const alt = item.emoji.replace(/"/g, '');
    document.execCommand('insertHTML', false,
      `<img class="tg-emoji" src="${item.thumbnailUrl}" alt="${alt}" `
      + `data-emoji-id="${item.customEmojiId}" data-fallback="${alt}">`);
    emit();
  }, [emit]);

  const actions: ToolbarAction[] = [
    { icon: <Bold className="h-4 w-4" />, label: 'Qalin', shortcut: 'Ctrl+B', run: () => exec('bold') },
    { icon: <Italic className="h-4 w-4" />, label: 'Kursiv', shortcut: 'Ctrl+I', run: () => exec('italic') },
    { icon: <Underline className="h-4 w-4" />, label: 'Tagi chizilgan', shortcut: 'Ctrl+U', run: () => exec('underline') },
    { icon: <Strikethrough className="h-4 w-4" />, label: "O'chirilgan", shortcut: 'Ctrl+Shift+X', run: () => exec('strikeThrough') },
    { icon: <EyeOff className="h-4 w-4" />, label: 'Spoiler', shortcut: 'Ctrl+Shift+P', run: () => wrapSelection('span', 'tg-spoiler') },
    { icon: <Code className="h-4 w-4" />, label: 'Monoshrift', shortcut: 'Ctrl+Shift+M', run: () => wrapSelection('code') },
    { icon: <Link2 className="h-4 w-4" />, label: 'Havola', shortcut: 'Ctrl+K', run: () => addLink() },
    { icon: <Eraser className="h-4 w-4" />, label: 'Formatni tozalash', shortcut: 'Ctrl+\\', run: () => exec('removeFormat') },
  ];

  function addLink() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      window.alert('Avval havola qilinadigan matnni tanlang.');
      return;
    }
    const url = window.prompt('Havola manzili:', 'https://');
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      window.alert("Havola https:// bilan boshlanishi kerak.");
      return;
    }
    exec('createLink', url);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    const key = e.key.toLowerCase();

    if (e.shiftKey) {
      if (key === 'x') { e.preventDefault(); exec('strikeThrough'); }
      if (key === 'p') { e.preventDefault(); wrapSelection('span', 'tg-spoiler'); }
      if (key === 'm') { e.preventDefault(); wrapSelection('code'); }
      return;
    }
    if (key === 'k') { e.preventDefault(); addLink(); }
    if (key === '\\') { e.preventDefault(); exec('removeFormat'); }
    // b/i/u — brauzerning o'z tezkor tugmalari, lekin ular emit() ni
    // chaqirmaydi. Shuning uchun ularni ham o'zimiz boshqaramiz.
    if (key === 'b') { e.preventDefault(); exec('bold'); }
    if (key === 'i') { e.preventDefault(); exec('italic'); }
    if (key === 'u') { e.preventDefault(); exec('underline'); }
  }

  /**
   * Nusxa ko'chirishda FAQAT matn olinadi.
   *
   * <p>Saytdan yoki Word'dan ko'chirilgan bo'lak o'zi bilan o'nlab
   * `<span style>` va `<font>` olib keladi. Serializator ularni baribir
   * tashlaydi, lekin bu yerda to'xtatish yaxshiroq: admin ko'rgan narsa
   * saqlanadigan narsaga mos bo'ladi, "ko'rinishda rangli edi, saqlaganda
   * yo'qoldi" degan chalkashlik chiqmaydi.
   */
  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emit();
  }

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-border bg-background shadow-xs', className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-1.5 py-1">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            title={`${action.label} (${action.shortcut})`}
            // Tugmaga bosilganda tahrirlagichdagi tanlov yo'qolmasin.
            onMouseDown={(e) => e.preventDefault()}
            onClick={action.run}
            className="rounded p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
          >
            {action.icon}
          </button>
        ))}

        {emojiPacks && (
          <button
            type="button"
            title="Emoji paneli"
            aria-expanded={pickerOpen}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setPickerOpen((open) => !open)}
            className={cn(
              'rounded p-1.5 transition',
              pickerOpen
                ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                : 'text-muted-foreground hover:bg-background hover:text-foreground',
            )}
          >
            <Smile className="h-4 w-4" />
          </button>
        )}
      </div>

      {/*
        Matn tahrirlash maydoni doimo ko'rinib turadi — emoji paneli
        matn ustiga tushib uni to'sib qo'ymaydi, balki pastga joylashadi.
      */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Xabar matni"
        onInput={emit}
        onBlur={emit}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className={cn(
          'tg-editor w-full resize-y overflow-y-auto px-3 py-2.5 text-sm leading-relaxed outline-none',
          pickerOpen ? 'min-h-[160px] max-h-[280px]' : 'min-h-[260px] max-h-[460px]',
        )}
      />

      {/*
        Emoji paneli muharrir ostiga doklanadi — matnni to'smaydi,
        yozish va bir vaqtning o'zida emojilar tanlash imkonini beradi.
      */}
      {pickerOpen && emojiPacks && (
        <EmojiPicker
          packs={emojiPacks}
          onPick={(item) => {
            insertEmoji(item);
            // Panel ochiq qoladi: odatda ketma-ket bir nechta emoji
            // qo'yiladi va har safar qayta ochish zerikarli bo'lardi.
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
