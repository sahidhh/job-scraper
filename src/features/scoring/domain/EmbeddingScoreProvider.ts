import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";

// Port for stage-2 local semantic scoring (scoring.md §3, decisions.md
// AD-31) -- a jobhunt-style resume/job embedding cosine similarity, mapped
// continuously to [0,1] via cosineSimilarityToScore. Implemented by a
// local, offline Transformers.js adapter with no per-call cost. Returns
// null when there's no text to embed or the embedding call fails -- the
// job keeps its keywordScore/aiScore with embeddingScore left null
// (jobhunt bug #7: this fallback must be logged by the implementation, not
// silent).
export interface EmbeddingScoreProvider {
  score(input: { job: Job; resume: Resume }): Promise<number | null>;
}
