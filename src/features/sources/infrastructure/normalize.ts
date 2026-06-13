// Normalization rule 3 (scrapers.md §3): all postedAt values become ISO
// 8601 UTC strings, or null if the source gives nothing usable.
export function toIsoOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
