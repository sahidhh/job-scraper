import { normalizeWhitespace } from "@/shared/infrastructure/text";

// Normalization rule 3 (scrapers.md §3): all postedAt values become ISO
// 8601 UTC strings, or null if the source gives nothing usable.
export function toIsoOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Some feeds (e.g. Himalayas) express postedAt as a Unix timestamp in
// *seconds*, which `new Date(value)` would misread as milliseconds (mapping
// every posting to ~1970). Multiply into ms first.
export function toIsoFromUnixSeconds(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) {
    return null;
  }
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Remote-board adapters (remotive, himalayas) expose only a plain location /
// restriction string rather than a "Remote - <X>" convention. Prefixing with
// "Remote - " makes tagLocations tag the job `remote` (so it survives the
// location filter at scrape time) AND lets classifyEligibility's structural
// "Remote - <country>" geo-lock (candidate-constraints.ts) hard-exclude
// single-country-locked postings ("Remote - USA") while keeping
// India-open/worldwide ones. An empty/whitespace value or one that already
// leads with "Remote" is passed through untouched.
export function toRemoteLocationRaw(raw: string | null | undefined): string {
  const trimmed = normalizeWhitespace(raw ?? "");
  if (trimmed === "") {
    return "remote";
  }
  if (/^remote\b/i.test(trimmed)) {
    return trimmed;
  }
  return `Remote - ${trimmed}`;
}
