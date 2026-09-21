/**
 * Kanal postidagi tugmadan kelgan Mini App payloadi.
 *
 * Telegram `t.me/<bot>/<app>?startapp=<payload>` havolasini ochganda
 * payloadni ikki joydan beradi: URL fragmentidagi `tgWebAppStartParam`
 * va SDK'dagi `initDataUnsafe.start_param`. Fragment SERVERGA HECH
 * QACHON bormaydi, shuning uchun uni `proxy.ts` o'qiy olmaydi — payload
 * shu yerda, brauzerda ochiladi.
 *
 * Payload tarkibi: `<e'lon id>` yoki `<e'lon id>_<hamkor kodi>`
 * (marketplace tarafidagi `ListingDeepLink` bilan bir xil). Natija esa
 * ataylab brauzerdagi havolaning AYNAN O'ZI: `/marketplace/<id>?p=<kod>`.
 * Shunda referalni ushlash zanjiri o'zgarishsiz qoladi — kodni
 * middleware cookie'ga yozadi, `ReferralCapture` esa login bo'lgach
 * da'vo qiladi.
 */

/** Kod shakli — `referral-capture.ts` dagi bilan bir xil. */
const CODE = /^[A-Z0-9]{8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Payloaddan ichki manzil yasaydi.
 *
 * Shaklga tushmagan qiymat uchun `null`: payload havolada ochiq turadi
 * va istalgan odam uni o'zgartira oladi, ya'ni undan yasalgan manzil
 * tekshirilmasdan navigatsiyaga ketmasligi kerak.
 */
export function startParamTarget(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const [listingId, code, ...rest] = raw.trim().split('_');
  if (rest.length > 0) return null;
  if (!UUID.test(listingId ?? '')) return null;
  const path = `/marketplace/${listingId.toLowerCase()}`;
  if (code === undefined) return path;
  return CODE.test(code) ? `${path}?p=${code}` : path;
}

type StartParamSource = {
  location?: { hash?: string };
  Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } };
};

/** Payloadni fragmentdan, bo'lmasa SDK'dan oladi. */
export function readStartParam(source?: StartParamSource): string | null {
  const win = source ?? (typeof window === 'undefined' ? undefined : window);
  if (!win) return null;

  const hash = win.location?.hash?.replace(/^#/, '');
  if (hash) {
    // SDK skripti CSP yoki tarmoq sababli kechikishi mumkin — fragment
    // esa sahifa ochilishidayoq joyida turadi.
    const fromHash = new URLSearchParams(hash).get('tgWebAppStartParam');
    if (fromHash) return fromHash;
  }
  return win.Telegram?.WebApp?.initDataUnsafe?.start_param ?? null;
}

/** Kanal postidan kelingan bo'lsa — o'sha e'lon manzili, aks holda null. */
export function miniAppStartTarget(source?: StartParamSource): string | null {
  return startParamTarget(readStartParam(source));
}
