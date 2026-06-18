// Mirrors the `resumes` table (database.md §2).
export interface Resume {
  id: string;
  filePath: string; // Supabase Storage path
  parsedText: string;
  skills: string[]; // canonical skill names (skills-dictionary.ts)
  uploadedAt: string; // ISO 8601
  isActive: boolean;
  version: number; // monotonically increasing; incremented on each upload
}

// Input to ResumeRepository.create() -- atomically becomes the active
// resume, deactivating any previous one (decisions.md AD-09).
export interface NewResume {
  filePath: string;
  parsedText: string;
  skills: string[];
}
