// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Foydalanuvchi menyusi — hisobga oid sahifalarga YAGONA yo'l.
 *
 * <p>Bu sinov ikki marta takrorlangan xatodan keyin yozildi: sahifa
 * quriladi, ishlaydi, lekin unga hech qayerdan havola qo'yilmaydi.
 * Manzilni qo'lda yozgan odam uni ochadi va hammasi joyida deb o'ylaydi;
 * menyudan qidirgan odam esa uni umuman topa olmaydi. Nosozlik jim
 * bo'lgani uchun uni qo'lda sinab ko'rish bilan tutib bo'lmaydi.
 */
describe('user menu', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/components/navigation/user-menu.tsx'),
    'utf8',
  );

  // Bu sahifalarga BOSHQA yo'l yo'q — menyudan tushib qolsa, ular
  // foydalanuvchi uchun mavjud bo'lmay qoladi.
  //
  // Hamkorlik havolasi shartli (`href={partner ? ... : ...}`), shuning
  // uchun u quyidagi `href="..."` ro'yxatida emas, alohida tekshiriladi.
  it('links to the partner dashboard once the user is a partner', () => {
    // Ikkala manzil ham menyuda bo'lishi kerak: hamkor bo'lgan odamga
    // biri, bo'lmaganga ikkinchisi ko'rsatiladi. Bittasi tushib qolsa,
    // o'sha guruh sahifani umuman topa olmaydi.
    expect(source).toContain("'/partner'");
    expect(source).toContain("'/partnership'");
  });

  it.each([
    ['/hamyon', 'Hamyon'],
    ['/invite', "Do'st taklif qilish"],
    ['/mail', 'Pochta'],
    ['/help', 'Yordam'],
  ])('links to %s', (href) => {
    expect(source).toContain(`href="${href}"`);
  });
});
