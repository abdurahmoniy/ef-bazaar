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

    claimReferral(code)
      .then(() => {
        // Faqat SERVER JAVOB BERGANDA o'chiramiz. Javob "rad etildi"
        // bo'lsa ham o'chiriladi — kod eskirgan yoki odam allaqachon
        // taklif qilingan, qayta urinish buni o'zgartirmaydi.
        document.cookie = `${REFERRAL_COOKIE}=; path=/; max-age=0`;
      })
      .catch(() => {
        // Tarmoq uzilgan: so'rov serverga umuman yetib bormadi.
        // Cookie QOLDIRILADI — bir soatlik oyna hali ochiq va keyingi
        // sahifada yana urinamiz. Bu yerda o'chirsak, referal hech
        // qanday sabab bo'lmasa ham butunlay yo'qolardi.
      });
  }, [authenticated]);

  return null;
}
