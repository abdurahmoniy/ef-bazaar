import { apiFetch } from '@/lib/api';

/**
 * Kanaldagi post havolasidan kelgan bosishni yozadi.
 *
 * SAHIFANI KUTTIRMAYDI va hech qachon otmaydi. Bosish jurnali —
 * statistika; uni yozib bo'lmagani uchun e'lon sahifasini sekinlashtirish
 * yoki ko'rsatmaslik mutlaqo o'rinsiz.
 *
 * Kod formati serverda ham tekshiriladi; bu yerdagisi shunchaki
 * keraksiz so'rovni to'sadi.
 */
const CODE = /^[A-Z0-9]{8}$/;

export function recordChannelClick(rawCode: unknown, listingId: string): void {
  if (typeof rawCode !== 'string') return;
  const code = rawCode.trim().toUpperCase();
  if (!CODE.test(code)) return;

  // OBYEKT beriladi, satr emas: apiFetch tanani o'zi JSON.stringify
  // qiladi va Content-Type ni ham o'zi qo'yadi. Oldindan satrga
  // aylantirsak tana ikki marta o'raladi va server ildizda obyekt
  // emas, satr ko'radi — bosish umuman yozilmasdi va hamkor o'zi
  // olib kelgan savdodan ulush ololmasdi.
  void apiFetch('/marketplace/v1/partners/click', {
    method: 'POST',
    body: { linkCode: code, listingId },
  }).catch(() => {
    // Statistika sahifaga ta'sir qilmaydi.
  });
}
