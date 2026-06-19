import type { JobMatch } from "@/features/notifications/domain/types";

export interface BandedMatches {
  /** ai_score >= strongThreshold, sorted descending by score. */
  strongMatches: JobMatch[];
  /** ai_score < strongThreshold, sorted descending by score. */
  worthReviewing: JobMatch[];
}

// Splits a flat list of JobMatch objects into strong-match and
// worth-reviewing bands using the supplied threshold. Both outputs are
// sorted descending by aiScore so callers can take the top-N directly.
export function bandMatches(matches: JobMatch[], strongThreshold: number): BandedMatches {
  const strongMatches = matches
    .filter((m) => m.aiScore >= strongThreshold)
    .sort((a, b) => b.aiScore - a.aiScore);

  const worthReviewing = matches
    .filter((m) => m.aiScore < strongThreshold)
    .sort((a, b) => b.aiScore - a.aiScore);

  return { strongMatches, worthReviewing };
}
