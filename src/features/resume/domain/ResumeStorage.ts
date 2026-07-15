// Port for the Supabase Storage side of a resume upload (bucket: "resumes"),
// injected into uploadResume() so parse-then-persist ordering (bug fix:
// MERGE_PLAN.md Bug 1) can be enforced and tested without a real Storage
// client. Deliberately not folded into ResumeRepository -- restore and
// apply-suggestions both call ResumeRepository.create() without touching
// Storage (they reuse an existing file or have no backing file at all,
// decisions.md AD-33), so "upload the source file" is specific to a fresh
// upload, not to every new resume version.
export interface ResumeStorage {
  upload(filePath: string, buffer: Buffer, mimeType: string): Promise<void>;

  /** Best-effort cleanup of an orphaned object (e.g. DB insert failed after upload succeeded). */
  remove(filePath: string): Promise<void>;
}
