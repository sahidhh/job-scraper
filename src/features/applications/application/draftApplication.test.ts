import { describe, expect, it, vi } from "vitest";
import type { ApplicationDraftProvider } from "@/features/applications/domain/ApplicationDraftProvider";
import type { ApplicationRepository } from "@/features/applications/domain/ApplicationRepository";
import type { Application } from "@/features/applications/domain/types";
import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";
import { draftApplication, MAX_DESCRIPTION_PROMPT_CHARS, MAX_RESUME_PROMPT_CHARS } from "./draftApplication";

const job: Job = {
  id: "job-1",
  source: "greenhouse",
  sourceJobId: "src-1",
  companyId: null,
  companyName: "Acme",
  canonicalCompanyName: "Acme",
  title: "Software Engineer",
  locationRaw: "Bangalore",
  locationTags: ["india"],
  description: "d".repeat(MAX_DESCRIPTION_PROMPT_CHARS + 500),
  url: "https://example.com/job",
  postedAt: null,
  firstSeenAt: "2026-01-01T00:00:00Z",
  lastSeenAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  isActive: true,
  inactiveReason: null,
  minYears: null,
  fingerprint: "fp",
  contactEmail: "recruiter@acme.example",
  contactEmailCategory: "recruiter",
  contactEmailConfidence: "high",
  salaryCurrency: null,
  salaryMin: null,
  salaryMax: null,
  salaryPeriod: null,
  salaryConfidence: null,
  employmentType: "full_time",
  seniority: "mid",
  workArrangement: null,
  visaSponsorship: null,
  relocationAssistance: null,
  securityClearance: false,
  urgentHiring: false,
};

const resume: Resume = {
  id: "resume-1",
  filePath: "abc.pdf",
  parsedText: "r".repeat(MAX_RESUME_PROMPT_CHARS + 500),
  skills: ["python"],
  uploadedAt: "2026-01-01T00:00:00Z",
  isActive: true,
  version: 1,
  contentHash: "hash",
};

const draftedApplication: Application = {
  id: "app-1",
  jobId: job.id,
  resumeId: resume.id,
  kind: "email",
  subject: "Application for Software Engineer",
  body: "Dear team,",
  recipientEmail: job.contactEmail,
  status: "draft",
  model: "gemini-2.5-flash",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  sentAt: null,
};

function makeDeps(existing: Application | null) {
  const provider: ApplicationDraftProvider = {
    draft: vi.fn().mockResolvedValue({ subject: draftedApplication.subject, body: draftedApplication.body, model: draftedApplication.model }),
  };
  const repository: ApplicationRepository = {
    getById: vi.fn(),
    findByJobAndKind: vi.fn().mockResolvedValue(existing),
    listByJob: vi.fn(),
    listPendingDrafts: vi.fn(),
    upsertDraft: vi.fn().mockResolvedValue(draftedApplication),
    updateContent: vi.fn(),
    markSent: vi.fn(),
    markDismissed: vi.fn(),
  };
  return { provider, repository };
}

describe("draftApplication", () => {
  it("truncates description and resume text before calling the provider", async () => {
    const { provider, repository } = makeDeps(null);

    await draftApplication(job, resume, "email", { provider, repository });

    const call = (provider.draft as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_PROMPT_CHARS + "... [truncated]".length);
    expect(call.resumeText.length).toBeLessThanOrEqual(MAX_RESUME_PROMPT_CHARS + "... [truncated]".length);
  });

  it("persists the draft via upsertDraft with the job's contact email", async () => {
    const { provider, repository } = makeDeps(null);

    const result = await draftApplication(job, resume, "email", { provider, repository });

    expect(repository.upsertDraft).toHaveBeenCalledWith({
      jobId: job.id,
      resumeId: resume.id,
      kind: "email",
      subject: draftedApplication.subject,
      body: draftedApplication.body,
      recipientEmail: job.contactEmail,
      model: draftedApplication.model,
    });
    expect(result).toEqual(draftedApplication);
  });

  it("allows redrafting an existing 'draft' row", async () => {
    const { provider, repository } = makeDeps({ ...draftedApplication, status: "draft" });

    await expect(draftApplication(job, resume, "email", { provider, repository })).resolves.toEqual(draftedApplication);
  });

  it("allows redrafting a 'dismissed' row", async () => {
    const { provider, repository } = makeDeps({ ...draftedApplication, status: "dismissed" });

    await expect(draftApplication(job, resume, "email", { provider, repository })).resolves.toEqual(draftedApplication);
  });

  it("rejects redrafting an already-'sent' row", async () => {
    const { provider, repository } = makeDeps({ ...draftedApplication, status: "sent" });

    await expect(draftApplication(job, resume, "email", { provider, repository })).rejects.toThrow("already been sent");
    expect(provider.draft).not.toHaveBeenCalled();
  });
});
