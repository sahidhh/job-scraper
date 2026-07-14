import type { ResumeSuggestionItem } from "./types";

export interface SuggestResult {
  items: ResumeSuggestionItem[];
  model: string;
}

// Port for AI resume coaching (decisions.md AD-32/AD-33), backed by the
// provider-agnostic src/shared/infrastructure/llmClient.ts (Gemini default,
// Anthropic optional -- LLM_PROVIDER). Distinct from AiScoreProvider
// (scoring.md §3): that port scores a job against a resume; this one
// coaches the resume itself. Unlike AiScoreProvider's "never throws, null
// on failure" convention, this port propagates failures -- resume
// suggestions are a synchronous, user-initiated action with no cached
// fallback to degrade to (same reasoning as RoleExpansionProvider).
export interface ResumeSuggestionProvider {
  /** Proposes concrete, selectable improvements for one chunk of resume text. */
  suggest(input: { resumeText: string; targetRole: string }): Promise<SuggestResult>;

  /**
   * Rewrites one chunk of resume text applying only the chosen suggestions.
   * Must never fabricate experience, skills, dates, or achievements not
   * already present in resumeText (jobhunt/enhance.py's APPLY_SYSTEM
   * contract).
   */
  rewrite(input: { resumeText: string; chosen: ResumeSuggestionItem[] }): Promise<string>;
}
