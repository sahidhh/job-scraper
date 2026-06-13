import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";
import type { AiScoreProvider, AiScoreResult } from "@/features/scoring/domain/AiScoreProvider";
import { callOpenRouterJson } from "@/shared/infrastructure/openrouterClient";

const SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number" },
    reasoning: { type: "string" },
  },
  required: ["score", "reasoning"],
  additionalProperties: false,
} as const;

interface JobMatchResponse {
  score?: unknown;
  reasoning?: unknown;
}

function buildSystemPrompt(resume: Resume): string {
  return [
    "You are an assistant that scores how well a job posting matches a candidate's resume.",
    `Candidate skills: ${resume.skills.join(", ")}`,
    "Candidate resume:",
    resume.parsedText,
    "Respond with score (a number from 0 to 1) and reasoning (1-3 sentences explaining the score).",
  ].join("\n");
}

function buildJobPrompt(job: Job): string {
  return [
    `Title: ${job.title}`,
    `Company: ${job.companyName ?? "Unknown"}`,
    `Location: ${job.locationRaw}`,
    "Description:",
    job.description,
  ].join("\n");
}

// Stage-2 AI scoring (scoring.md §3, decisions.md AD-07). Never throws --
// any failure (timeout, bad status, malformed response) yields null so
// scoreJob keeps the keyword score with aiScore/aiReasoning left null.
export class OpenRouterAiScoreProvider implements AiScoreProvider {
  async score(input: { job: Job; resume: Resume }): Promise<AiScoreResult | null> {
    try {
      const result = (await callOpenRouterJson({
        messages: [
          { role: "system", content: buildSystemPrompt(input.resume) },
          { role: "user", content: buildJobPrompt(input.job) },
        ],
        schemaName: "job_match_score",
        schema: SCHEMA,
      })) as JobMatchResponse;

      if (typeof result.score !== "number" || typeof result.reasoning !== "string") {
        return null;
      }

      return {
        score: Math.min(1, Math.max(0, result.score)),
        reasoning: result.reasoning,
      };
    } catch {
      return null;
    }
  }
}
