const CHANNEL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** URL selection is only a set of IDs. Current availability and prices come from the API. */
export function parseAdvertisingChannels(value: string | string[] | undefined): string[] {
  const unique = new Set<string>();
  for (const raw of typeof value === 'string' ? [value] : value ?? []) {
    const id = raw.trim();
    if (CHANNEL_ID.test(id)) unique.add(id);
  }
  return [...unique];
}

export function listingAdvertisingHref(listingId: string, channelIds: string[] = []): string {
  const search = new URLSearchParams();
  for (const id of parseAdvertisingChannels(channelIds)) search.append('channel', id);
  const query = search.toString();
  return `/marketplace/${encodeURIComponent(listingId)}/advertise${query ? `?${query}` : ''}`;
}
