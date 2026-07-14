// Port for LLM-based extraction of job listings from a careers page's plain
// text (merge-workspace Phase 5, ports jobhunt/sources.py's
// `fetch_company_careers`). One implementation (LlmCareersPageExtractor),
// kept as a port for the same testability reason ApplicationDraftProvider/
// ResumeSuggestionProvider are ports: callers can substitute a fake in tests
// instead of mocking completeLlm's HTTP layer directly.
export interface ExtractedCareersJob {
  title: string;
  location: string;
  description: string;
  // Absolute URL if the page provided one; "" if not (caller falls back to
  // the page URL itself).
  url: string;
}

export interface CareersPageExtractor {
  extract(pageUrl: string, pageText: string): Promise<ExtractedCareersJob[]>;
}
