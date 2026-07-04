import type { NewCareerPage } from "./types";

export interface CareerPageRepository {
  /**
   * Upsert on canonicalCompanyName (Phase 2 Task 8). A later discovery for
   * the same company overwrites the earlier one -- callers are expected to
   * only pass higher-or-equal confidence updates (e.g. `scripts/
   * discover-career-pages.ts` only ever writes 'ats_board'/'high').
   */
  upsertMany(pages: NewCareerPage[]): Promise<void>;
}
