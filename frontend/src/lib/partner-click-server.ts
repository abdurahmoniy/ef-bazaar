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

  void apiFetch('/marketplace/v1/partners/click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linkCode: code, listingId }),
  }).catch(() => {
    // Statistika sahifaga ta'sir qilmaydi.
  });
}
