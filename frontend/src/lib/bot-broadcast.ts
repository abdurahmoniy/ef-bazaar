/**
 * Inline tugmalar panelining ma'lumot ko'rinishi va uni o'zgartirish amallari.
 *
 * <p>Amallar shu yerda — komponent ichida emas — chunki ular indeks ustida
 * ishlaydi va aynan shu yerda xato qilish oson: tugma boshqa qatorga
 * qo'shiladi, oxirgi tugma o'chganda bo'sh qator qolib ketadi, cheklov
 * noto'g'ri qatorga qo'llanadi. Bularning hammasi sof funksiya sifatida
 * sinovdan o'tkaziladi, brauzersiz.
 */

/**
 * Telegram qatorda 8 tagacha tugmaga ruxsat beradi. Biz 3 tada to'xtaymiz:
 * undan ko'pi telefon ekranida o'qib bo'lmaydigan darajada siqiladi va
 * matnlar qirqiladi.
 */
export const MAX_BUTTONS_PER_ROW = 3;

/** Telegram jami 100 tagacha ruxsat beradi; bu yerda amaliy chegara. */
export const MAX_ROWS = 10;

export interface InlineButton {
  text: string;
  url: string;
}

export type InlineButtonRows = InlineButton[][];

/** Tugma qo'shilayotgan yoki tahrirlanayotgan joy. */
export interface ButtonSlot {
  row: number;
  col: number;
}

export function canAddColumn(rows: InlineButtonRows, row: number): boolean {
  return rows[row] !== undefined && rows[row].length < MAX_BUTTONS_PER_ROW;
}

export function canAddRow(rows: InlineButtonRows): boolean {
  return rows.length < MAX_ROWS;
}

/** Qator oxiriga tugma qo'shadi. Cheklovga yetgan bo'lsa hech narsa qilmaydi. */
export function addColumn(rows: InlineButtonRows, row: number, button: InlineButton): InlineButtonRows {
  if (!canAddColumn(rows, row)) return rows;
  return rows.map((r, i) => (i === row ? [...r, button] : r));
}

/** Eng pastga yangi qator qo'shadi. */
export function addRow(rows: InlineButtonRows, button: InlineButton): InlineButtonRows {
  if (!canAddRow(rows)) return rows;
  return [...rows, [button]];
}

export function updateButton(rows: InlineButtonRows, slot: ButtonSlot, button: InlineButton): InlineButtonRows {
  return rows.map((r, i) => (i === slot.row ? r.map((b, j) => (j === slot.col ? button : b)) : r));
}

/**
 * Tugmani o'chiradi va qator bo'shab qolsa qatorning o'zini ham olib
 * tashlaydi — aks holda Telegram bo'sh qatorni rad etadi va panelda
 * hech narsaga bog'lanmagan `+` osilib qolardi.
 */
export function removeButton(rows: InlineButtonRows, slot: ButtonSlot): InlineButtonRows {
  return rows
    .map((r, i) => (i === slot.row ? r.filter((_, j) => j !== slot.col) : r))
    .filter((r) => r.length > 0);
}

/**
 * Tugmani tekshiradi.
 *
 * <p>Havola Telegram tomonidan tekshiriladi va yaroqsiz bo'lsa BUTUN xabar
 * rad etiladi — ya'ni bitta noto'g'ri havola ommaviy jo'natmani to'xtatadi.
 * Shuning uchun tekshiruv yozish paytida bo'ladi.
 *
 * @returns xato matni, yoki null — hammasi joyida
 */
export function validateButton(button: InlineButton): string | null {
  const text = button.text.trim();
  if (!text) return 'Tugma matni bo’sh bo’lmasligi kerak';
  // Telegram tugma matnini qirqmaydi, lekin uzun matn ekranga sig'maydi.
  if (text.length > 32) return 'Tugma matni 32 belgidan oshmasligi kerak';

  const url = button.url.trim();
  if (!url) return 'Havola bo’sh bo’lmasligi kerak';
  if (!/^(https?:\/\/|tg:\/\/)/i.test(url)) {
    return 'Havola https:// yoki tg:// bilan boshlanishi kerak';
  }
  return null;
}

/** Panel bo'shmi — bitta ham tugma yo'qmi. */
export function isEmpty(rows: InlineButtonRows): boolean {
  return rows.every((r) => r.length === 0);
}
