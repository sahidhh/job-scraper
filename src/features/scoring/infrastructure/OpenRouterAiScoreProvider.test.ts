import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";
import { OpenRouterAiScoreProvider } from "./OpenRouterAiScoreProvider";

function chatResponse(content: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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
  updatedAt: "2026-01-01T00:00:00Z",
};

const resume: Resume = {
  id: "resume-1",
  filePath: "resumes/resume-1.pdf",
  parsedText: "Experienced engineer skilled in React and Node.js",
  skills: ["React", "Node.js"],
  uploadedAt: "2026-01-01T00:00:00Z",
  isActive: true,
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

  it("returns a score and reasoning from a well-formed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.85, reasoning: "Strong match" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterAiScoreProvider();
    const result = await provider.score({ job, resume });

    expect(result).toEqual({ score: 0.85, reasoning: "Strong match" });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[1].content).toContain("Senior React Developer");
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
});
