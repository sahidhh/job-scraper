import type { RawJob } from "@/features/sources/domain/types";
import type { LocationTag } from "@/shared/domain/enums";

// Output of filtering.application.tagLocations() -- a RawJob annotated
// with the location tags it matched (architecture.md §3.1 step 4).
// Jobs with an empty locationTags array are dropped before ingest.
export interface TaggedRawJob extends RawJob {
  locationTags: LocationTag[];
}

// Config shape for matching locationRaw text to a LocationTag.
// Concrete keyword lists live in shared/config (data, not domain).
export interface LocationKeywordRule {
  tag: LocationTag;
  keywords: readonly string[]; // case-insensitive word-boundary matches against locationRaw
}
