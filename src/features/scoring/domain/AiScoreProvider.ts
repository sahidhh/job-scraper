import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";

export interface AiScoreResult {
  score: number; // [0,1]
  reasoning: string;
  // Whether the posting EXPLICITLY states visa sponsorship/relocation is
  // available. The model classifies this (a job it's good at); scoreJob then
  // applies the deterministic eligibility cap in code (AD-53). Defaults false
  // (unconfirmed) when the model omits it -- the conservative direction.
  sponsorshipConfirmed: boolean;
  model: string; // OPENROUTER_MODEL value used for this call
  tokensInput: number | null;
  tokensOutput: number | null;
}

// Port for stage-2 AI scoring (scoring.md §3, decisions.md AD-07).
// Implemented by an OpenRouter-backed adapter with its own
// timeout+1-retry policy. Returns null if the call ultimately fails --
// the job keeps its keywordScore with aiScore/aiReasoning left null.
export interface AiScoreProvider {
  score(input: { job: Job; resume: Resume }): Promise<AiScoreResult | null>;
}
