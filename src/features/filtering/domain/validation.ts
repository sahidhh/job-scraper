import { LOCATION_TAGS, type LocationTag } from "@/shared/domain/enums";

export function isKnownLocationTag(tag: string): tag is LocationTag {
  return (LOCATION_TAGS as readonly string[]).includes(tag);
}

// A job is kept only if it matched at least one allowed location
// (architecture.md §3.1 step 5).
export function hasAllowedLocation(tags: readonly LocationTag[]): boolean {
  return tags.length > 0;
}
