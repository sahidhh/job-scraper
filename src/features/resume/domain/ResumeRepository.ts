import type { NewResume, Resume } from "./types";

export interface ResumeRepository {
  getActive(): Promise<Resume | null>;

  /**
   * Inserts the new resume as active and deactivates the previous active
   * one, atomically (set_active_resume RPC, decisions.md AD-09).
   */
  create(input: NewResume): Promise<Resume>;

  /** Manual edits to extracted skills, overriding dictionary extraction. */
  updateSkills(id: string, skills: string[]): Promise<Resume>;
}
