import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { readCodeFromSearch, REFERRAL_COOKIE } from '@/lib/referral-capture';

/** 30 kun — odam havolani bosib, keyinroq qaytib ro'yxatdan o'tishi mumkin. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Taklif kodini cookie'ga yozadi.
 *
 * NEGA MIDDLEWARE, React effekti emas. Middleware marshrutlashdan OLDIN
 * ishlaydi, shuning uchun sahifa anonim mehmonni login'ga yo'naltirsa ham
 * kod saqlanadi. Komponentda qilingan bo'lsa yo'qolardi: server
 * komponentidagi `redirect()` layout chizilishidan oldin otadi, ya'ni
 * komponent umuman mount bo'lmaydi — va o'sha sahifalar yasaydigan
 * `?from=` parametri so'rov satrini baribir tashlab yuboradi.
 *
 * Bugungi tushish sahifalari ochiq, lekin bu bugungi holat haqidagi
 * fakt. Ertaga yopiq sahifaga havola qo'yilsa, referal jimgina
 * yo'qolardi — hech qayerda xato chiqmasdan.
 */
export function middleware(request: NextRequest) {
  const code = readCodeFromSearch(request.nextUrl.search);
  const response = NextResponse.next();

  if (code) {
    response.cookies.set(REFERRAL_COOKIE, code, {
      // httpOnly EMAS: ro'yxatdan o'tgach uni brauzerdagi kod o'qib
      // da'vo yuboradi. Bu sir emas — kod havolada ochiq turadi.
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    });
  }
  return response;
}

export const config = {
  // Statik fayllar va API yo'llari hech qachon taklif havolasining
  // manzili bo'lmaydi — ularda middleware ishlashi behuda.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
