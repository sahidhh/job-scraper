import type { CareersPageExtractor, ExtractedCareersJob } from "@/features/sources/domain/CareersPageExtractor";
import { parseLenientJson } from "@/shared/infrastructure/lenientJson";
import { completeLlm } from "@/shared/infrastructure/llmClient";

// Ports jobhunt/sources.py's fetch_company_careers system prompt verbatim
// (JSON-array-only response, absolute URL if present else empty).
const EXTRACT_SYSTEM =
  "Extract job postings from this careers page text. Respond with ONLY a JSON array; " +
  "each item has keys: title, location, description (short), url (absolute if present, " +
  "else empty). If no jobs are present, return [].";

const EXTRACT_MAX_TOKENS = 2000;
const MAX_JOBS_PER_CHUNK = 15;

interface RawExtractedJob {
  title?: unknown;
  location?: unknown;
  description?: unknown;
  url?: unknown;
}

// Implements CareersPageExtractor via the provider-agnostic llmClient
// (decisions.md AD-32) -- a fourth caller alongside resume suggest/apply and
// application drafting. Never throws on an unparseable response -- an
// LLM-extraction miss on one page/chunk should degrade to "found nothing
// here", not fail the whole fetch (unlike LlmApplicationDraftProvider's
// single-call, throw-on-failure shape, which has no "just skip this part"
// option since a draft is one indivisible request).
export class LlmCareersPageExtractor implements CareersPageExtractor {
  async extract(pageUrl: string, pageText: string): Promise<ExtractedCareersJob[]> {
    const { text, model } = await completeLlm({
      system: EXTRACT_SYSTEM,
      user: `Page URL: ${pageUrl}\n\n${pageText}`,
      maxTokens: EXTRACT_MAX_TOKENS,
      jsonMode: true,
    });

    const parsed = parseLenientJson<RawExtractedJob[]>(text);
    if (!Array.isArray(parsed)) {
      console.warn(`[careers-url] model=${model} returned an unparseable response`);
      return [];
    }

    return parsed.slice(0, MAX_JOBS_PER_CHUNK).map((item) => ({
      title: typeof item.title === "string" ? item.title : "",
      location: typeof item.location === "string" ? item.location : "",
      description: typeof item.description === "string" ? item.description : "",
      url: typeof item.url === "string" ? item.url : "",
    }));
  }
}
