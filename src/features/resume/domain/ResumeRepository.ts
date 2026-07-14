import type { NewResume, Resume } from "./types";

export interface ResumeRepository {
  getActive(): Promise<Resume | null>;

  /**
   * Every resume version (active and inactive), newest version first.
   * Backs the version-history/undo UI -- old versions are preserved in
   * Postgres by set_active_resume's deactivate-not-delete semantics but
   * were otherwise unreachable from the application layer.
   */
  listVersions(): Promise<Resume[]>;

  /**
   * Most recent resume row (any version) with this content_hash, or null.
   * Backs the sha256 parse-once cache (decisions.md AD-30) -- lets the
   * application layer skip pdf-parse/mammoth entirely on a re-upload of
   * byte-identical content.
   */
  findByContentHash(contentHash: string): Promise<Resume | null>;

  /**
   * Inserts the new resume as active and deactivates the previous active
   * one, atomically (set_active_resume RPC, decisions.md AD-09).
   */
  create(input: NewResume): Promise<Resume>;

  /** Manual edits to extracted skills, overriding dictionary extraction. */
  updateSkills(id: string, skills: string[]): Promise<Resume>;
}
