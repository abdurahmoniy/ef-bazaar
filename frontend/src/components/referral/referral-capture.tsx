'use client';

import { useEffect } from 'react';

import { readCookieCode, REFERRAL_COOKIE } from '@/lib/referral-capture';
import { claimReferral } from '@/lib/referrals';

/**
 * Hech nima chizmaydi. Foydalanuvchi kirgan bo'lsa, middleware yozib
 * qo'ygan kodni da'vo qiladi va cookie'ni o'chiradi.
 *
 * Kodni URL'dan O'QISH BU YERDA EMAS — u middleware'da, chunki bu
 * komponent login'ga yo'naltiradigan sahifada mount bo'lmaydi.
 */
export function ReferralCapture({ authenticated }: { authenticated: boolean }) {
  useEffect(() => {
    if (!authenticated) return;

    const code = readCookieCode(document.cookie);
    if (!code) return;

    void claimReferral(code).finally(() => {
      // Natijadan qat'i nazar o'chiramiz: kod bir marta da'vo qilinadi
      // va rad javobi qayta urinishdan o'zgarmaydi.
      document.cookie = `${REFERRAL_COOKIE}=; path=/; max-age=0`;
    });
  }, [authenticated]);

  return null;
}
