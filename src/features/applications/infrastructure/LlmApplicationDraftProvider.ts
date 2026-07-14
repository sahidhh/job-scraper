import type { ApplicationDraftInput, ApplicationDraftProvider, ApplicationDraftResult } from "@/features/applications/domain/ApplicationDraftProvider";
import { parseLenientJson } from "@/shared/infrastructure/lenientJson";
import { completeLlm } from "@/shared/infrastructure/llmClient";

// Ports jobhunt/apply.py's DRAFT_SYSTEM prompt verbatim: truthful-only
// constraint, JSON-only response shape, and the two length targets by kind.
const DRAFT_SYSTEM = [
  "You write concise, professional job applications. Use ONLY facts present in the candidate's resume; ",
  "never invent experience, skills, or metrics. Match the role's key requirements to real resume points. ",
  'Respond with ONLY a JSON object: {"subject": "...", "body": "..."}. For kind=email keep it short ',
  "(120-180 words). For kind=coverletter, 250-350 words.",
].join("");

const DRAFT_MAX_TOKENS = 1500;

interface RawDraft {
  subject?: unknown;
  body?: unknown;
}

// Implements ApplicationDraftProvider via the provider-agnostic llmClient
// (decisions.md AD-32) -- a third caller alongside LlmResumeSuggestionProvider's
// suggest/rewrite. Throws on failure (no cached fallback for a synchronous,
// user-initiated draft request), matching that provider's convention.
export class LlmApplicationDraftProvider implements ApplicationDraftProvider {
  async draft(input: ApplicationDraftInput): Promise<ApplicationDraftResult> {
    const context = [
      `kind: ${input.kind}`,
      `Job title: ${input.jobTitle} at ${input.companyName}`,
      `Job location: ${input.locationRaw}`,
      `Job description:\n${input.description}`,
      "",
      `Candidate resume:\n${input.resumeText}`,
    ].join("\n");

    const { text, model } = await completeLlm({
      system: DRAFT_SYSTEM,
      user: context,
      maxTokens: DRAFT_MAX_TOKENS,
      jsonMode: true,
    });

    const parsed = parseLenientJson<RawDraft>(text);
    if (!parsed || typeof parsed !== "object") {
      console.warn(`[application-draft] model=${model} returned an unparseable response`);
      throw new Error("Application draft response was not a JSON object");
    }

    return {
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      body: typeof parsed.body === "string" ? parsed.body : "",
      model,
    };
  }
}
