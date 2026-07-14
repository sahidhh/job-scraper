// Mirrors the `resumes` table (database.md §2).
export interface Resume {
  id: string;
  filePath: string; // Supabase Storage path
  parsedText: string;
  skills: string[]; // canonical skill names (skills-dictionary.ts)
  uploadedAt: string; // ISO 8601
  isActive: boolean;
  version: number; // monotonically increasing; incremented on each upload
  contentHash: string | null; // sha256 of the source file bytes; parse-once cache key (AD-30)
}

// Input to ResumeRepository.create() -- atomically becomes the active
// resume, deactivating any previous one (decisions.md AD-09).
export interface NewResume {
  filePath: string;
  parsedText: string;
  skills: string[];
  // null when this version has no backing uploaded file (e.g. an
  // AI-applied resume-suggestions rewrite, decisions.md AD-33) -- the
  // sha256 parse-once cache (AD-30) only ever looks up *real* file hashes,
  // so a synthetic version must never carry one forward from its parent
  // (that would make a future re-upload of the original file incorrectly
  // cache-hit the AI-rewritten text instead of the actual extracted text).
  contentHash: string | null;
}

// One category label per jobhunt/enhance.py's SUGGEST_SYSTEM prompt contract.
export type ResumeSuggestionCategory = "Impact" | "Skills" | "Keywords" | "Clarity" | "Formatting";

export interface ResumeSuggestionItem {
  id: string;
  category: ResumeSuggestionCategory;
  title: string;
  detail: string;
}

// Mirrors the `resume_suggestions` table (decisions.md AD-33). Scoped to
// the exact resume version (resumeId) it was generated against -- stale
// once that resume is superseded by a newer version, same convention as
// job_scores.resume_version.
export interface ResumeSuggestionSet {
  id: string;
  resumeId: string;
  targetRole: string;
  suggestions: ResumeSuggestionItem[];
  model: string;
  createdAt: string; // ISO 8601
  // Set once a chosen subset is applied -- points at the NEW resume version
  // that resulted (never the same id as resumeId; apply always creates a
  // new version, never overwrites).
  appliedAsResumeId: string | null;
}

export interface NewResumeSuggestionSet {
  resumeId: string;
  targetRole: string;
  suggestions: ResumeSuggestionItem[];
  model: string;
}
