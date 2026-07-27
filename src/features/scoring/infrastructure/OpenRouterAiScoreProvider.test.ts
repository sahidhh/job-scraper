import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";
import { OpenRouterAiScoreProvider } from "./OpenRouterAiScoreProvider";

function chatResponse(
  content: unknown,
  usage?: { prompt_tokens?: number; completion_tokens?: number },
): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const job: Job = {
  id: "job-1",
  source: "greenhouse",
  sourceJobId: "123",
  companyId: null,
  companyName: "Acme",
  title: "Senior React Developer",
  locationRaw: "Remote",
  locationTags: ["remote"],
  description: "Build UI with React and Node.js",
  url: "https://example.com/jobs/123",
  postedAt: null,
  firstSeenAt: "2026-01-01T00:00:00Z",
  lastSeenAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  isActive: true,
  inactiveReason: null,
  minYears: null,
  canonicalCompanyName: "Acme",
  fingerprint: "test-fingerprint",
  contactEmail: null,
  contactEmailCategory: null,
  contactEmailConfidence: null,
  salaryCurrency: null,
  salaryMin: null,
  salaryMax: null,
  salaryPeriod: null,
  salaryConfidence: null,
  employmentType: null,
  seniority: null,
  workArrangement: null,
  visaSponsorship: null,
  relocationAssistance: null,
  securityClearance: false,
  urgentHiring: false,
  ineligibleReason: null,
};

const resume: Resume = {
  id: "resume-1",
  filePath: "resumes/resume-1.pdf",
  parsedText: "Experienced engineer skilled in React and Node.js",
  skills: ["React", "Node.js"],
  uploadedAt: "2026-01-01T00:00:00Z",
  isActive: true,
  version: 1,
  contentHash: "hash-1",
};

describe("OpenRouterAiScoreProvider", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "test-model";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
  });

  it("returns a score, reasoning, and model name from a well-formed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.85, reasoning: "Strong match" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    const result = await provider.score({ job, resume });

    expect(result).toEqual({
      score: 0.85,
      reasoning: "Strong match",
      sponsorshipConfirmed: false,
      model: "test-model",
      tokensInput: null,
      tokensOutput: null,
    });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[1].content).toContain("Senior React Developer");
  });

  it("returns sponsorshipConfirmed from the response, defaulting to false when absent or mistyped (AD-53)", async () => {
    const confirmed = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "sponsors", sponsorshipConfirmed: true }));
    vi.stubGlobal("fetch", confirmed);
    expect((await new OpenRouterAiScoreProvider().score({ job, resume }))?.sponsorshipConfirmed).toBe(true);

    // Absent -> conservative default of false (caps rather than frees).
    const absent = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "silent" }));
    vi.stubGlobal("fetch", absent);
    expect((await new OpenRouterAiScoreProvider().score({ job, resume }))?.sponsorshipConfirmed).toBe(false);

    // Mistyped (string) -> also false, not a malformed-response failure.
    const mistyped = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "x", sponsorshipConfirmed: "yes" }));
    vi.stubGlobal("fetch", mistyped);
    expect((await new OpenRouterAiScoreProvider().score({ job, resume }))?.sponsorshipConfirmed).toBe(false);
  });

  it("clamps out-of-range scores into [0, 1]", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 1.5, reasoning: "great" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    const result = await provider.score({ job, resume });

    expect(result?.score).toBe(1);
  });

  it("returns null when the response is malformed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: "not-a-number" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    const result = await provider.score({ job, resume });

    expect(result).toBeNull();
  });

  it("returns null when the request errors out", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    const result = await provider.score({ job, resume });

    expect(result).toBeNull();
  });

  it("getStats tracks successful and failed calls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse({ score: 0.9, reasoning: "Great fit" }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume });
    await provider.score({ job, resume });

    const stats = provider.getStats();
    expect(stats.successful).toBe(1);
    expect(stats.failed).toBe(1);
  });

  it("getStats classifies quota_exceeded failures from 402 responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("insufficient credits", { status: 402 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume });
    await provider.score({ job, resume });

    const stats = provider.getStats();
    expect(stats.failed).toBe(2);
    expect(stats.failuresByReason.quota_exceeded).toBe(2);
  });

  it("getStats classifies malformed_response when score/reasoning types are wrong", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: "not-a-number" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume });

    const stats = provider.getStats();
    expect(stats.failed).toBe(1);
    expect(stats.failuresByReason.malformed_response).toBe(1);
  });

  it("still counts billed tokens when the response shape is malformed", async () => {
    // Regression test: tokens were previously discarded on a shape-mismatch
    // failure even though OpenRouter had already billed for them.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(chatResponse({ score: "not-a-number" }, { prompt_tokens: 900, completion_tokens: 40 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume });

    const stats = provider.getStats();
    expect(stats.totalTokensInput).toBe(900);
    expect(stats.totalTokensOutput).toBe(40);
  });

  it("still counts billed tokens when the response has no usable content", async () => {
    // Regression test: callOpenRouterJson throws before returning usage when
    // content is missing/invalid -- those tokens were silently dropped.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: {} }], usage: { prompt_tokens: 700, completion_tokens: 0 } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume });

    const stats = provider.getStats();
    expect(stats.failuresByReason.malformed_response).toBe(1);
    expect(stats.totalTokensInput).toBe(700);
    expect(stats.totalTokensOutput).toBe(0);
  });

  it("getStats returns a snapshot that does not mutate with subsequent calls", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(chatResponse({ score: 0.5, reasoning: "ok" })));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume });
    const snapshot = provider.getStats();

    await provider.score({ job, resume });

    expect(snapshot.successful).toBe(1);
    expect(provider.getStats().successful).toBe(2);
  });

  it("getStats accumulates token totals from successful calls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse({ score: 0.8, reasoning: "good" }, { prompt_tokens: 1000, completion_tokens: 60 }))
      .mockResolvedValueOnce(chatResponse({ score: 0.6, reasoning: "ok" }, { prompt_tokens: 800, completion_tokens: 50 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume });
    await provider.score({ job, resume });

    const stats = provider.getStats();
    expect(stats.totalTokensInput).toBe(1800);
    expect(stats.totalTokensOutput).toBe(110);
  });

  it("score result includes tokensInput and tokensOutput from usage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(chatResponse({ score: 0.75, reasoning: "nice" }, { prompt_tokens: 1500, completion_tokens: 70 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    const result = await provider.score({ job, resume });

    expect(result?.tokensInput).toBe(1500);
    expect(result?.tokensOutput).toBe(70);
  });

  it("includes structured location tags in the job prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const jobWithTags: Job = { ...job, locationRaw: "Singapore (Hybrid)", locationTags: ["singapore"] };
    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job: jobWithTags, resume });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[1].content).toContain("Singapore (Hybrid)");
    expect(body.messages[1].content).toContain("tags: singapore");
  });

  it("omits the tags clause when locationTags is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const jobNoTags: Job = { ...job, locationRaw: "Unknown", locationTags: [] };
    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job: jobNoTags, resume });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[1].content).toContain("Location: Unknown");
    expect(body.messages[1].content).not.toContain("tags:");
  });

  it("includes experience requirement in the job prompt when minYears is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const seniorJob: Job = { ...job, minYears: 5 };
    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job: seniorJob, resume });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[1].content).toContain("Experience required: 5+ years");
  });

  it("omits the experience line when minYears is null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume }); // job.minYears = null

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[1].content).not.toContain("Experience required");
  });

  it("does not include a standalone skills list in the system prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[0].content).not.toContain("Candidate skills:");
    expect(body.messages[0].content).toContain(resume.parsedText);
  });

  it("truncates a resume longer than OPENROUTER_MAX_RESUME_PROMPT_CHARS (Phase 3 Task 11-12)", async () => {
    process.env.OPENROUTER_MAX_RESUME_PROMPT_CHARS = "20";
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const longResume: Resume = { ...resume, parsedText: "a".repeat(100) };
    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume: longResume });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[0].content).toContain(`${"a".repeat(20)}... [truncated]`);
    expect(body.messages[0].content).not.toContain("a".repeat(21));
    delete process.env.OPENROUTER_MAX_RESUME_PROMPT_CHARS;
  });

  it("truncates a job description longer than OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS (Phase 3 Task 11-12)", async () => {
    process.env.OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS = "20";
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const longDescriptionJob: Job = { ...job, description: "b".repeat(100) };
    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job: longDescriptionJob, resume });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[1].content).toContain(`${"b".repeat(20)}... [truncated]`);
    expect(body.messages[1].content).not.toContain("b".repeat(21));
    delete process.env.OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS;
  });

  it("includes the candidate's eligibility, seniority, and stack constraints in the system prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const systemPrompt = body.messages[0].content as string;
    expect(systemPrompt).toContain("Chennai, India");
    expect(systemPrompt).toContain("visa sponsorship");
    expect(systemPrompt).toContain("~2 years");
    expect(systemPrompt).toContain("Python and TypeScript");
    expect(systemPrompt).toContain("NOT a Java-primary candidate");
  });

  it("instructs the model that seniority/stack mismatch and sponsorship-silent onsite roles cap the score below strong", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const systemPrompt = body.messages[0].content as string;
    expect(systemPrompt).toContain("Seniority mismatch");
    expect(systemPrompt).toContain("Primary-stack mismatch");
    expect(systemPrompt).toContain("silent on sponsorship");
  });

  it("expresses the caps as explicit numeric ceilings and asks for the sponsorshipConfirmed flag (AD-53)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "ok", sponsorshipConfirmed: false }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const systemPrompt = body.messages[0].content as string;
    // Numeric ceilings, not adjectives -- the whole point of AD-53's prompt half.
    expect(systemPrompt).toContain("MUST NOT exceed 0.40");
    expect(systemPrompt).toContain("MUST NOT exceed 0.50");
    expect(systemPrompt).toContain("sponsorshipConfirmed");
  });

  it("makes the preferred-geography signal subordinate to the sponsorship cap (a target location does not waive sponsorship)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const systemPrompt = body.messages[0].content as string;
    // Preferred geographies (Singapore/UAE) must not let a sponsorship-silent
    // onsite role score "strong" -- the whole point of this tightening.
    expect(systemPrompt).toContain("does NOT waive the sponsorship requirement");
    expect(systemPrompt).toContain("does not confirm sponsorship");
  });

  it("does not truncate text within the default caps", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    await provider.score({ job, resume });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[0].content).not.toContain("[truncated]");
    expect(body.messages[1].content).not.toContain("[truncated]");
  });
});
