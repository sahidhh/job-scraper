import type { NewResumeSuggestionSet, ResumeSuggestionSet } from "./types";

export interface ResumeSuggestionRepository {
  create(input: NewResumeSuggestionSet): Promise<ResumeSuggestionSet>;

  getById(id: string): Promise<ResumeSuggestionSet | null>;

  /** Records which new resume version resulted from applying this set. */
  markApplied(id: string, appliedAsResumeId: string): Promise<void>;
}
