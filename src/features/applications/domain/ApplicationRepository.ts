import type { Application, ApplicationKind, NewApplicationDraft, PendingApplicationDraft } from "./types";

export interface ApplicationRepository {
  getById(id: string): Promise<Application | null>;

  /** The (job_id, kind) row, if one has ever been drafted for this job. */
  findByJobAndKind(jobId: string, kind: ApplicationKind): Promise<Application | null>;

  listByJob(jobId: string): Promise<Application[]>;

  /**
   * Every application still awaiting user action (status = 'draft'), joined
   * with its job's title/company -- feeds the Telegram reminder
   * (application/notifyPendingDrafts.ts), which reuses the existing digest
   * delivery infra rather than a new notification channel.
   */
  listPendingDrafts(): Promise<PendingApplicationDraft[]>;

  /**
   * Insert a new (job_id, kind) row, or overwrite the existing one -- the
   * unique (job_id, kind) constraint means this is always an upsert.
   */
  upsertDraft(input: NewApplicationDraft): Promise<Application>;

  /** User-edited subject/body during review. */
  updateContent(id: string, subject: string, body: string): Promise<Application>;

  /** Marks 'sent' and stamps sent_at -- the terminal, immutable state. */
  markSent(id: string): Promise<Application>;

  /** Marks 'dismissed' -- redraftable later via upsertDraft. */
  markDismissed(id: string): Promise<Application>;
}
