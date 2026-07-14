// Ports jobhunt/apply.py's draft/send shape (merge-workspace Phase 4,
// decisions.md AD-34): AI drafts an email or cover letter for one job,
// scoped to the resume version used to write it; the user reviews/edits it,
// then sends via their own mail client (mailto: link) or dismisses it.
// Mirrors the `applications` table (erd.md).
export const APPLICATION_KINDS = ["email", "coverletter"] as const;
export type ApplicationKind = (typeof APPLICATION_KINDS)[number];

export const APPLICATION_STATUSES = ["draft", "sent", "dismissed"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Application {
  id: string;
  jobId: string;
  // Active resume version this draft was written against -- same
  // "scoped to the exact version" convention as ResumeSuggestionSet.resumeId.
  resumeId: string;
  kind: ApplicationKind;
  subject: string;
  body: string;
  // Best-effort contact email from jobs.contact_email at draft time. Null
  // when the posting had none -- the mailto: link is still valid with no
  // recipient, the user fills it in themselves.
  recipientEmail: string | null;
  status: ApplicationStatus;
  model: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  sentAt: string | null; // ISO 8601, set only once markSent succeeds
}

// Input to ApplicationRepository.upsertDraft() -- inserts a new (job_id,
// kind) row, or overwrites an existing 'draft'/'dismissed' one. Never called
// against an existing 'sent' row (application/draftApplication.ts guards
// this before the repository is reached).
export interface NewApplicationDraft {
  jobId: string;
  resumeId: string;
  kind: ApplicationKind;
  subject: string;
  body: string;
  recipientEmail: string | null;
  model: string;
}

// Minimal job context needed for ApplicationRepository.listPendingDrafts()'s
// join -- just enough to render a Telegram reminder line, not a full Job.
export interface PendingApplicationDraft {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  kind: ApplicationKind;
  createdAt: string; // ISO 8601
}
