import type { NewResumeSuggestionSet, Resume, ResumeSuggestionItem, ResumeSuggestionSet } from "@/features/resume/domain/types";
import type { ResumeSuggestionProvider } from "@/features/resume/domain/ResumeSuggestionProvider";
import type { ResumeSuggestionRepository } from "@/features/resume/domain/ResumeSuggestionRepository";
import { chunkText } from "@/shared/infrastructure/text";

// jobhunt/enhance.py truncates via `working_text[:12000]` (jobhunt bug #2).
// This chunks instead so every part of a long resume is analyzed, not just
// the first ~12k chars -- see decisions.md AD-33.
export const DEFAULT_SUGGESTION_CHUNK_CHARS = 6000;

export interface SuggestResumeImprovementsDeps {
  provider: ResumeSuggestionProvider;
  repository: ResumeSuggestionRepository;
  chunkChars?: number;
}

// Chunks resume.parsedText and calls the provider once per chunk
// (sequentially -- mirrors scoreJob's one-call-per-unit-of-work shape),
// concatenating every chunk's suggestions rather than stopping at the
// first. Renumbers ids sequentially across the merged list so chosen-id
// references from the UI stay unambiguous. Persists the merged set as one
// versioned row scoped to this exact resume (resumeId), never mutated
// afterward except to record an applied-to link (markApplied).
export async function suggestResumeImprovements(
  resume: Resume,
  targetRole: string,
  deps: SuggestResumeImprovementsDeps,
): Promise<ResumeSuggestionSet> {
  const chunks = chunkText(resume.parsedText, deps.chunkChars ?? DEFAULT_SUGGESTION_CHUNK_CHARS);

  const merged: ResumeSuggestionItem[] = [];
  let model = "";
  for (const chunk of chunks) {
    const result = await deps.provider.suggest({ resumeText: chunk, targetRole });
    merged.push(...result.items);
    model = result.model;
  }

  const renumbered = merged.map((item, index) => ({ ...item, id: `s${index + 1}` }));

  const input: NewResumeSuggestionSet = {
    resumeId: resume.id,
    targetRole,
    suggestions: renumbered,
    model,
  };

  return deps.repository.create(input);
}
