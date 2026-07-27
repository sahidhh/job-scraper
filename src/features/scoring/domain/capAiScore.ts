import type { LocationTag } from "@/shared/domain/enums";

/**
 * Hard numeric ceiling applied to the AI match score when a job is onsite in a
 * foreign target market (Singapore / UAE) that would require visa sponsorship
 * and the posting does not confirm sponsorship is available (`docs/decisions.md`
 * AD-53).
 *
 * AD-50 tried to enforce this cap through the scoring prompt alone ("worth
 * reviewing, never strong"). It didn't hold: the model reliably *identifies*
 * unconfirmed sponsorship in its prose ("...visa sponsorship which is not
 * confirmed...") but then emits a high number anyway -- a 100%-scored onsite
 * Singapore frontend role whose own reasoning listed two disqualifiers. LLMs
 * map qualitative judgements to calibrated numbers poorly, so the cap is
 * enforced deterministically in code and the model is asked only for the
 * classification it is good at (the `sponsorshipConfirmed` boolean).
 */
export const UNCONFIRMED_SPONSORSHIP_AI_CEILING = 0.4;

export interface AiScoreCapResult {
  /** The score after applying the ceiling (unchanged when no cap applies). */
  score: number;
  /** Note appended to aiReasoning when a cap was applied; null otherwise. */
  capReason: string | null;
}

// Foreign target markets that require a work visa for this India-based
// candidate. India-onsite needs no sponsorship (the safety-net case) and remote
// is handled separately by classifyEligibility's geo-lock, so neither belongs
// here. Derived from the LocationTag union deliberately (not a free string) so
// adding a new tag forces a review of this list.
const FOREIGN_SPONSORSHIP_TAGS: readonly LocationTag[] = ["singapore", "uae"];

/**
 * Deterministic eligibility cap on the AI score (AD-53). Applies only when the
 * job is (a) onsite/hybrid -- i.e. NOT tagged `remote` -- and (b) in a foreign
 * market that needs sponsorship (Singapore/UAE) with no India fallback tag, and
 * (c) the posting did not confirm sponsorship. In every other case
 * (remote, India-onsite, sponsorship confirmed, or an already-low score) the AI
 * score passes through untouched. Pure; no I/O.
 */
export function capAiScoreForEligibility(
  job: { locationTags: readonly LocationTag[] },
  aiScore: number,
  sponsorshipConfirmed: boolean,
): AiScoreCapResult {
  const isRemote = job.locationTags.includes("remote");
  const hasIndiaFallback = job.locationTags.includes("india");
  const foreignMarkets = FOREIGN_SPONSORSHIP_TAGS.filter((tag) => job.locationTags.includes(tag));

  const needsUnconfirmedSponsorship =
    !isRemote && foreignMarkets.length > 0 && !hasIndiaFallback && !sponsorshipConfirmed;

  if (needsUnconfirmedSponsorship && aiScore > UNCONFIRMED_SPONSORSHIP_AI_CEILING) {
    return {
      score: UNCONFIRMED_SPONSORSHIP_AI_CEILING,
      capReason:
        `[Auto-capped to ${UNCONFIRMED_SPONSORSHIP_AI_CEILING}: onsite ${foreignMarkets.join("/")} ` +
        `role without confirmed visa sponsorship (AD-53).]`,
    };
  }

  return { score: aiScore, capReason: null };
}
