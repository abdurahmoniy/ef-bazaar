/** Marketplace ordering; value score remains the public default. */
export const LISTING_SORT_OPTIONS = [
  { id: 'value', label: "Qiymat bo'yicha", param: 'valueScore,desc' },
  { id: 'price-asc', label: 'Arzon narx', param: 'price,asc' },
  { id: 'price-desc', label: 'Qimmat narx', param: 'price,desc' },
  { id: 'popular', label: "Ko'p yoqtirilgan", param: 'likeCount,desc' },
  { id: 'newest', label: 'Eng yangi', param: 'createdAt,desc' },
  { id: 'oldest', label: 'Eng eski', param: 'createdAt,asc' },
] as const;

export const DEFAULT_LISTING_SORT = LISTING_SORT_OPTIONS[0].param;

export type ListingSortId = (typeof LISTING_SORT_OPTIONS)[number]['id'];

export function isListingSortId(value: string | undefined): value is ListingSortId {
  return LISTING_SORT_OPTIONS.some((option) => option.id === value);
}

export function sortIdToParam(id: ListingSortId | undefined) {
  const found = LISTING_SORT_OPTIONS.find((option) => option.id === id);
  return found?.param ?? LISTING_SORT_OPTIONS[0].param;
}

export function paramToSortId(param: string | undefined): ListingSortId {
  const found = LISTING_SORT_OPTIONS.find((option) => option.param === param);
  return found?.id ?? 'value';
}
