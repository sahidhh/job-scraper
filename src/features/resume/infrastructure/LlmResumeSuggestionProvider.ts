import type { ResumeSuggestionCategory, ResumeSuggestionItem } from "@/features/resume/domain/types";
import type { ResumeSuggestionProvider, SuggestResult } from "@/features/resume/domain/ResumeSuggestionProvider";
import { parseLenientJson } from "@/shared/infrastructure/lenientJson";
import { completeLlm } from "@/shared/infrastructure/llmClient";

// Ports jobhunt/enhance.py's two prompts verbatim (category set, "do not
// invent qualifications" constraint, plain-text-only apply output).
const SUGGEST_SYSTEM = [
  "You are a resume coach. Given a resume (and optional target role), propose specific, actionable improvements.",
  'Respond with ONLY a JSON array. Each item: {"category": "Impact|Skills|Keywords|Clarity|Formatting", ' +
    '"title": "short label", "detail": "what to change and why, concretely"}.',
  "Do not invent qualifications. Propose 3-6 items for this section, highest impact first.",
].join(" ");

const APPLY_SYSTEM = [
  "You revise resumes. Apply ONLY the listed improvements to the resume text.",
  "Never fabricate jobs, skills, dates, or achievements the candidate did not state; rephrase and restructure only.",
  "Return ONLY the revised resume text, no commentary, no markdown fences.",
].join(" ");

const SUGGEST_MAX_TOKENS = 2000;
const APPLY_MAX_TOKENS = 4000;

const VALID_CATEGORIES: readonly ResumeSuggestionCategory[] = ["Impact", "Skills", "Keywords", "Clarity", "Formatting"];

interface RawSuggestion {
  category?: unknown;
  title?: unknown;
  detail?: unknown;
}

function normalizeCategory(value: unknown): ResumeSuggestionCategory {
  return typeof value === "string" && (VALID_CATEGORIES as readonly string[]).includes(value)
    ? (value as ResumeSuggestionCategory)
    : "Clarity";
}

// Implements ResumeSuggestionProvider via the provider-agnostic llmClient
// (decisions.md AD-32/AD-33). Unlike TransformersEmbeddingScoreProvider /
// OpenRouterAiScoreProvider's "never throw, null on failure" convention,
// this throws on any failure -- see ResumeSuggestionProvider's docstring
// for why (no cached fallback for a synchronous, user-initiated action).
export class LlmResumeSuggestionProvider implements ResumeSuggestionProvider {
  async suggest(input: { resumeText: string; targetRole: string }): Promise<SuggestResult> {
    const roleLine = input.targetRole ? `Target role: ${input.targetRole}\n\n` : "";
    const { text, model } = await completeLlm({
      system: SUGGEST_SYSTEM,
      user: `${roleLine}Resume:\n${input.resumeText}`,
      maxTokens: SUGGEST_MAX_TOKENS,
      jsonMode: true,
    });

    const parsed = parseLenientJson<RawSuggestion[]>(text);
    if (!Array.isArray(parsed)) {
      console.warn(`[resume-suggestions] suggest: model=${model} returned an unparseable response`);
      throw new Error("Resume suggestion response was not a JSON array");
    }

    const items: ResumeSuggestionItem[] = parsed
      .filter((item): item is RawSuggestion => typeof item === "object" && item !== null)
      .map((item, index) => ({
        id: `s${index + 1}`,
        category: normalizeCategory(item.category),
        title: typeof item.title === "string" ? item.title : "",
        detail: typeof item.detail === "string" ? item.detail : "",
      }));

    return { items, model };
  }

  async rewrite(input: { resumeText: string; chosen: ResumeSuggestionItem[] }): Promise<string> {
    const bullets = input.chosen.map((item) => `- ${item.title}: ${item.detail}`).join("\n");
    const { text } = await completeLlm({
      system: APPLY_SYSTEM,
      user: `Improvements to apply:\n${bullets}\n\nResume:\n${input.resumeText}`,
      maxTokens: APPLY_MAX_TOKENS,
    });
    return text.trim();
  }
}
