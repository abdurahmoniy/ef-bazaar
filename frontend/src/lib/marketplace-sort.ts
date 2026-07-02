export const LISTING_SORT_OPTIONS = [
  { id: 'newest', label: "Yangi e'lonlar", param: 'createdAt,desc' },
  { id: 'oldest', label: "Eski e'lonlar", param: 'createdAt,asc' },
  { id: 'price-asc', label: 'Arzon narx', param: 'price,asc' },
  { id: 'price-desc', label: 'Qimmat narx', param: 'price,desc' },
  { id: 'popular', label: "Ko'p yoqtirilgan", param: 'likeCount,desc' },
] as const;

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
  return found?.id ?? 'newest';
}
