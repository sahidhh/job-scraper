import type { ApplicationKind } from "./types";

export interface ApplicationDraftInput {
  kind: ApplicationKind;
  jobTitle: string;
  companyName: string;
  locationRaw: string;
  // Caller-truncated (application/draftApplication.ts) -- same prompt-cost
  // control as AD-23, not a new truncation decision.
  description: string;
  resumeText: string;
}

export interface ApplicationDraftResult {
  subject: string;
  body: string;
  model: string;
}

// Port for AI application drafting (jobhunt/apply.py's draft(), ported).
// Implemented by LlmApplicationDraftProvider via the provider-agnostic
// llmClient (decisions.md AD-32) -- a third caller of that abstraction
// alongside resume suggest/apply.
export interface ApplicationDraftProvider {
  draft(input: ApplicationDraftInput): Promise<ApplicationDraftResult>;
}
