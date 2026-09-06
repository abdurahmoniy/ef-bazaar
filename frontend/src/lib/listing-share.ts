export function listingShareUrl(origin: string, listingId: string, referralCode?: string | null) {
  const url = new URL(`/marketplace/${encodeURIComponent(listingId)}`, origin);
  if (referralCode && /^[A-Z0-9]{8}$/.test(referralCode)) url.searchParams.set('ref', referralCode);
  return url.toString();
}

export function telegramListingShareUrl(url: string, title: string) {
  const share = new URL('https://t.me/share/url');
  share.searchParams.set('url', url);
  share.searchParams.set('text', `Bu eFootball akkountini ko‘rib chiqing: ${title}`);
  return share.toString();
}
