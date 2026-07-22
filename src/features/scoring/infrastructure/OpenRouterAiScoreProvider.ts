import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";
import type { AiScoreProvider, AiScoreResult } from "@/features/scoring/domain/AiScoreProvider";
import { CANDIDATE_CONSTRAINTS } from "@/shared/config/candidate-constraints";
import { optionalEnv, requireEnv } from "@/shared/infrastructure/env";
import { type AiFailureReason, OpenRouterError, callOpenRouterJson } from "@/shared/infrastructure/openrouterClient";
import { truncateText } from "@/shared/infrastructure/text";

// Prompt-cost control (Phase 3 Task 11-12): the AI call is the expensive
// part of scoring, so both inputs are capped before being sent. Resumes and
// job descriptions carry their strongest matching signal in their first
// portion (skills/summary up top, requirements early) -- truncating the
// tail trades a small amount of recall on unusually long postings/resumes
// for a real, direct reduction in prompt tokens on every single AI call.
// Read per-call (not module-level), matching OPENROUTER_MAX_TOKENS's
// pattern in openrouterClient.ts, so an env change takes effect immediately.
function maxPromptChars(envVar: string, defaultValue: string): number {
  return Number(optionalEnv(envVar, defaultValue));
}

const SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number" },
    reasoning: { type: "string" },
    // AD-53: the model classifies sponsorship (a read/extract task it's good
    // at); scoreJob applies the numeric eligibility cap in code.
    sponsorshipConfirmed: { type: "boolean" },
  },
  required: ["score", "reasoning", "sponsorshipConfirmed"],
  additionalProperties: false,
} as const;

interface JobMatchResponse {
  score?: unknown;
  reasoning?: unknown;
  sponsorshipConfirmed?: unknown;
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

// Constraint-aware scoring (scoring-accuracy session): the AI previously
// scored purely on skill-keyword overlap with no notion of the candidate's
// eligibility, seniority band, or primary stack, so a Singapore-based
// Java/4+yrs posting could score as high as a genuinely applyable one just
// because both mention "backend" and a couple of overlapping tools. These
// rules make a "strong" (>= STRONG_MATCH_THRESHOLD, notifications/domain/
// types.ts) score mean "the candidate could actually apply today". Hard
// eligibility failures (geo-locked remote / sponsorship-refusing onsite)
// never reach this prompt at all -- they're excluded earlier by
// classifyEligibility.ts (scoreJob.ts) -- so the only onsite case the AI
// ever sees here is sponsorship-positive or sponsorship-silent.
function buildSystemPrompt(resume: Resume): string {
  return [
    "You are an assistant that scores how well a job posting matches a candidate's resume.",
    "Candidate resume:",
    truncateText(resume.parsedText, maxPromptChars("OPENROUTER_MAX_RESUME_PROMPT_CHARS", "4000")),
    "",
    "Candidate constraints (apply strictly -- do not infer around them):",
    `- Based in ${CANDIDATE_CONSTRAINTS.location}. Requires visa sponsorship for any onsite role -- an onsite posting that never mentions sponsorship is unconfirmed eligibility, not a pass.`,
    `- ~${CANDIDATE_CONSTRAINTS.yearsExperience} years of experience. A posting expecting meaningfully more (e.g. "4+ years", senior/lead/principal-level scope) is a seniority mismatch.`,
    `- Primary stack: ${CANDIDATE_CONSTRAINTS.primaryStack.join(" and ")}. Secondary: ${CANDIDATE_CONSTRAINTS.secondaryStack.join(", ")}. NOT a ${CANDIDATE_CONSTRAINTS.notPrimaryStack.join("/")}-primary candidate -- a posting whose primary/core stack is one of those is a stack mismatch even when peripheral tools overlap.`,
    `- Targeting ${CANDIDATE_CONSTRAINTS.targetRoles.join(", ")} roles.`,
    `- Preferred geographies (soft signal only): ${CANDIDATE_CONSTRAINTS.targetLocations.join(", ")}; onsite India (Bangalore/Chennai) is an acceptable fallback. "Preferred" means only "do not dock a role merely for being abroad" -- it does NOT waive the sponsorship requirement above. An onsite role in a preferred location (e.g. Singapore or the UAE) that is silent on sponsorship is still unconfirmed eligibility and is capped exactly like any other onsite role. The sole no-sponsorship-needed case is a genuinely remote role open to India. Never raise a score on location alone.`,
    "",
    "Scoring rules -- these are NUMERIC ceilings, not adjectives. Emit the actual number: never describe a cap in the reasoning while returning a score above it.",
    "- A high score (>= 0.70, \"strong match\") must mean the candidate could genuinely apply today: right seniority band, primary stack match, and (for onsite roles) confirmed sponsorship. Never award it on skill-keyword overlap alone.",
    "- Seniority mismatch (the posting wants meaningfully more experience than the candidate has): the score MUST NOT exceed 0.50, regardless of skill overlap.",
    "- Primary-stack mismatch (the posting's core/primary stack is not the candidate's): the score MUST NOT exceed 0.50, regardless of skill overlap.",
    "- An onsite posting that is silent on sponsorship: the score MUST NOT exceed 0.40 -- eligibility is unconfirmed. This holds even when the role is in a preferred/target location (e.g. Singapore, UAE): a desirable geography does not confirm sponsorship, so a strong resume-and-stack match to a sponsorship-silent onsite role is still capped, never strong.",
    "- Do not invent or assume facts not present in the job posting or resume.",
    "Also return sponsorshipConfirmed: true ONLY if the posting explicitly states visa sponsorship or relocation is available/provided; false if it is silent, ambiguous, or refuses it. Do not infer it from the company, seniority, or location -- a Singapore/UAE address does not by itself confirm sponsorship.",
    "Respond with score (a number from 0 to 1), sponsorshipConfirmed (boolean), and reasoning (1-3 sentences) that names which of these rules, if any, drove the score.",
  ].join("\n");
}

function buildJobPrompt(job: Job): string {
  const locationLine =
    job.locationTags.length > 0
      ? `Location: ${job.locationRaw} (tags: ${job.locationTags.join(", ")})`
      : `Location: ${job.locationRaw}`;

  const lines = [
    `Title: ${job.title}`,
    `Company: ${job.companyName ?? "Unknown"}`,
    locationLine,
  ];

  if (job.minYears !== null) {
    lines.push(`Experience required: ${job.minYears}+ years`);
  }

  lines.push("Description:", truncateText(job.description, maxPromptChars("OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS", "2000")));
  return lines.join("\n");
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
        // OpenRouter already billed for these tokens even though the shape
        // was unusable -- count them so cost tracking isn't an undercount.
        this.totalTokensInput += usage.promptTokens ?? 0;
        this.totalTokensOutput += usage.completionTokens ?? 0;
        console.warn(`[ai-score] job ${input.job.id}: failure_reason=malformed_response`);
        return null;
      }

      this.successful += 1;
      this.totalTokensInput += usage.promptTokens ?? 0;
      this.totalTokensOutput += usage.completionTokens ?? 0;

      return {
        score: Math.min(1, Math.max(0, result.score)),
        reasoning: result.reasoning,
        // Default to false (unconfirmed) when the model omits or mistypes it --
        // the conservative direction, so a missing flag caps rather than frees.
        sponsorshipConfirmed: result.sponsorshipConfirmed === true,
        model,
        tokensInput: usage.promptTokens,
        tokensOutput: usage.completionTokens,
      };
    } catch (err) {
      const reason: AiFailureReason = err instanceof OpenRouterError ? err.reason : "unknown";
      this.failed += 1;
      this.failuresByReason[reason] += 1;
      if (err instanceof OpenRouterError && err.usage) {
        // Already-billed tokens on a request that failed after the HTTP
        // response came back (e.g. missing/invalid content).
        this.totalTokensInput += err.usage.promptTokens ?? 0;
        this.totalTokensOutput += err.usage.completionTokens ?? 0;
      }
      console.warn(`[ai-score] job ${input.job.id}: failure_reason=${reason}`);
      return null;
    }
  }
}
