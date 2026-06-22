import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";
import type { AiScoreProvider, AiScoreResult } from "@/features/scoring/domain/AiScoreProvider";
import { requireEnv } from "@/shared/infrastructure/env";
import { type AiFailureReason, OpenRouterError, callOpenRouterJson } from "@/shared/infrastructure/openrouterClient";

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

export interface AiCallStats {
  successful: number;
  failed: number;
  failuresByReason: Record<AiFailureReason, number>;
  totalTokensInput: number;
  totalTokensOutput: number;
}

const EMPTY_FAILURES: Record<AiFailureReason, number> = {
  quota_exceeded: 0,
  provider_rate_limit: 0,
  provider_error: 0,
  malformed_response: 0,
  timeout: 0,
  unknown: 0,
};

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
// Call getStats() after a batch to retrieve success/failure analytics.
export class OpenRouterAiScoreProvider implements AiScoreProvider {
  private successful = 0;
  private failed = 0;
  private failuresByReason: Record<AiFailureReason, number> = { ...EMPTY_FAILURES };
  private totalTokensInput = 0;
  private totalTokensOutput = 0;

  getStats(): AiCallStats {
    return {
      successful: this.successful,
      failed: this.failed,
      failuresByReason: { ...this.failuresByReason },
      totalTokensInput: this.totalTokensInput,
      totalTokensOutput: this.totalTokensOutput,
    };
  }

  async score(input: { job: Job; resume: Resume }): Promise<AiScoreResult | null> {
    const model = requireEnv("OPENROUTER_MODEL");
    try {
      const { payload, usage } = await callOpenRouterJson({
        messages: [
          { role: "system", content: buildSystemPrompt(input.resume) },
          { role: "user", content: buildJobPrompt(input.job) },
        ],
        schemaName: "job_match_score",
        schema: SCHEMA,
      });
      const result = payload as JobMatchResponse;

      if (typeof result.score !== "number" || typeof result.reasoning !== "string") {
        this.failed += 1;
        this.failuresByReason.malformed_response += 1;
        console.warn(`[ai-score] job ${input.job.id}: failure_reason=malformed_response`);
        return null;
      }

      this.successful += 1;
      this.totalTokensInput += usage.promptTokens ?? 0;
      this.totalTokensOutput += usage.completionTokens ?? 0;

      return {
        score: Math.min(1, Math.max(0, result.score)),
        reasoning: result.reasoning,
        model,
        tokensInput: usage.promptTokens,
        tokensOutput: usage.completionTokens,
      };
    } catch (err) {
      const reason: AiFailureReason = err instanceof OpenRouterError ? err.reason : "unknown";
      this.failed += 1;
      this.failuresByReason[reason] += 1;
      console.warn(`[ai-score] job ${input.job.id}: failure_reason=${reason}`);
      return null;
    }
  }
}
