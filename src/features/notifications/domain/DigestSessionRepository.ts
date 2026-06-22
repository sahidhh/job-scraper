import type { DigestSession } from "./types";

export interface DigestSessionRepository {
  save(roleSelectionId: string, worthReviewingJobIds: string[], resumeVersion: number): Promise<{ id: string }>;
  getLatest(): Promise<DigestSession | null>;
  updatePaginationMessageId(id: string, messageId: number): Promise<void>;
}
