import { ApiException, apiFetch } from '@/lib/api';
import type { PartnerApplication } from '@/lib/partners';

/**
 * Hamkorlik arizasini SERVER tarafida o'qiydi.
 *
 * <p>{@code partners.ts} dagi nusxasi {@code credentials: 'include'}
 * ishlatadi va faqat brauzerda ishlaydi. Server komponentida cookie
 * o'z-o'zidan uzatilmaydi — {@code apiFetch} uni tokenga aylantiradi.
 */
export async function getMyApplicationServer(): Promise<PartnerApplication | null> {
  try {
    // Ariza bo'lmasa backend BO'SH TANA qaytaradi (200, null) — bu
    // JSON emas, ya'ni apiFetch bo'sh satr beradi.
    const application = await apiFetch<PartnerApplication | string | null>(
      '/marketplace/v1/partners/me',
    );
    return application && typeof application === 'object' ? application : null;
  } catch (e) {
    // Ariza yo'qligi xato emas. Marketplace javob bermasa ham odamni
    // "hamkor emas" deb hisoblaymiz: panelni ochib bo'lmaydi, chunki
    // uning ma'lumotlari ham o'sha servisdan keladi.
    if (e instanceof ApiException) return null;
    throw e;
  }
}
