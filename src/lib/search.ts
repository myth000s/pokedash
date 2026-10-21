export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** True when every word of the query appears in the normalised name. Empty queries match everything. */
export function matchesQuery(name: string, q: string): boolean {
  const words = normalizeForSearch(q).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const hay = normalizeForSearch(name);
  return words.every((w) => hay.includes(w));
}
