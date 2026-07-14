import type { NewResume, Resume } from "@/features/resume/domain/types";
import type { ResumeRepository } from "@/features/resume/domain/ResumeRepository";
import type { ResumeSuggestionProvider } from "@/features/resume/domain/ResumeSuggestionProvider";
import type { ResumeSuggestionRepository } from "@/features/resume/domain/ResumeSuggestionRepository";
import { validateParsedText, validateSkills } from "@/features/resume/domain/validation";
import { DomainValidationError } from "@/shared/domain/errors";
import { extractSkills, type SkillDictionaryEntry } from "@/shared/domain/skills";
import { chunkText } from "@/shared/infrastructure/text";
import { DEFAULT_SUGGESTION_CHUNK_CHARS } from "./suggestResumeImprovements";

export interface ApplyResumeSuggestionsDeps {
  provider: ResumeSuggestionProvider;
  suggestionRepository: ResumeSuggestionRepository;
  resumeRepository: ResumeRepository;
  skillsDictionary: readonly SkillDictionaryEntry[];
  chunkChars?: number;
}

// Applies a chosen subset of a stored suggestion set to `resume`, producing
// a brand NEW resume version -- resumeRepository.create() is the same
// atomic set_active_resume path uploadResume.ts uses, so this never
// overwrites parsed_text in place (decisions.md AD-33; jobhunt overwrites
// its working copy in place, which this deliberately does not replicate).
// Chunks resumeText the same way suggest() did (AD-33 / jobhunt bug #2) so
// the whole resume gets rewritten, not just its first chunk. Any provider
// failure aborts the whole call before anything is persisted -- there is
// no partial-version fallback, so a resume version is only ever created
// whole or not at all.
export async function applyResumeSuggestions(
  resume: Resume,
  suggestionSetId: string,
  chosenIds: string[],
  deps: ApplyResumeSuggestionsDeps,
): Promise<Resume> {
  const suggestionSet = await deps.suggestionRepository.getById(suggestionSetId);
  if (!suggestionSet) {
    throw new DomainValidationError("Suggestion set not found.");
  }
  if (suggestionSet.resumeId !== resume.id) {
    throw new DomainValidationError(
      "These suggestions were generated against a different resume version and can no longer be applied.",
    );
  }

  const chosen = suggestionSet.suggestions.filter((item) => chosenIds.includes(item.id));
  if (chosen.length === 0) {
    throw new DomainValidationError("Select at least one suggestion to apply.");
  }

  const chunks = chunkText(resume.parsedText, deps.chunkChars ?? DEFAULT_SUGGESTION_CHUNK_CHARS);
  const rewrittenChunks: string[] = [];
  for (const chunk of chunks) {
    rewrittenChunks.push(await deps.provider.rewrite({ resumeText: chunk, chosen }));
  }
  const parsedText = rewrittenChunks.join("\n\n");
  validateParsedText(parsedText);

  const skills = extractSkills(parsedText, deps.skillsDictionary);
  validateSkills(skills);

  const newResume: NewResume = {
    filePath: resume.filePath,
    parsedText,
    skills,
    contentHash: null,
  };
  const created = await deps.resumeRepository.create(newResume);

  await deps.suggestionRepository.markApplied(suggestionSetId, created.id);

  return created;
}
