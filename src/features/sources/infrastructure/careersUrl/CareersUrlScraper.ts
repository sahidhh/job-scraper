import { createHash } from "node:crypto";
import type { CareersPageExtractor } from "@/features/sources/domain/CareersPageExtractor";
import { jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import type { RawJob } from "@/features/sources/domain/types";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { chunkText, normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";

// Static careers-URL fetcher (merge-workspace Phase 5, ports jobhunt/sources.py's
// fetch_company_careers): fetches a single, PUBLIC careers page the operator
// provides and LLM-extracts the roles listed on it. Best-effort, static HTML
// only -- JS-rendered pages need a headless browser, deliberately not added
// here (jobhunt/sources.py's own docstring states the same limitation; a
// design rule carried forward ahead of Phase 6's formal CLAUDE.md merge).
//
// Not a JobSourceScraper (domain/JobSourceScraper.ts): that interface's
// `fetchJobs(companies, roles)` shape assumes a registry-wide feed/board with
// no per-call target. This is inherently single-URL-per-invocation and
// manual-trigger-only (scripts/scrape-careers-url.ts, not registry.ts/
// scrape.ts's cron loop -- see enums.ts's JOB_SOURCES comment for why
// `careers_url` is excluded from the source-health-tracked set), so it gets
// its own small function instead of forcing an ill-fitting shape onto the
// shared port.
const CHUNK_MAX_CHARS = 12000;
const MAX_JOBS_RETURNED = 30;

function extractDomain(url: string): string {
  const match = /https?:\/\/(?:www\.)?([^/]+)/.exec(url);
  return match ? match[1]! : url;
}

// Synthetic, stable sourceJobId (jobhunt bug #4's lesson applied here too:
// RawJob.sourceJobId is the (source, source_job_id) dedup/upsert key --
// domain/types.ts -- so a static page with no natural per-listing ID needs a
// deterministic one). Mirrors jobhunt's `hashlib.sha256((link + title)...)[:24]`.
function computeSyntheticJobId(link: string, title: string): string {
  return createHash("sha256").update(`${link}|${title}`).digest("hex").slice(0, 24);
}

export interface CareersUrlScraperDeps {
  extractor: CareersPageExtractor;
}

export async function fetchCareersUrlJobs(
  pageUrl: string,
  roles: readonly string[],
  deps: CareersUrlScraperDeps,
): Promise<RawJob[]> {
  const response = await fetchWithRetry(pageUrl, { headers: { "User-Agent": "Mozilla/5.0 (job-intelligence-platform)" } });
  if (!response.ok) {
    throw new Error(`careers page fetch returned ${response.status}`);
  }

  const html = await response.text();
  const text = stripHtml(html);
  if (!text.trim()) {
    console.warn(`[careers-url] page text is empty after stripping HTML: ${pageUrl}`);
    return [];
  }

  const chunks = chunkText(text, CHUNK_MAX_CHARS);
  const extracted = (await Promise.all(chunks.map((chunk) => deps.extractor.extract(pageUrl, chunk)))).flat();

  const companyName = extractDomain(pageUrl);
  const seen = new Set<string>();
  const rawJobs: RawJob[] = [];

  for (const item of extracted) {
    const title = normalizeWhitespace(item.title);
    if (!title) continue;

    const url = item.url || pageUrl;
    const sourceJobId = computeSyntheticJobId(url, title);
    if (seen.has(sourceJobId)) continue;
    seen.add(sourceJobId);

    rawJobs.push({
      source: "careers_url",
      sourceJobId,
      companyId: null,
      companyName,
      title,
      locationRaw: normalizeWhitespace(item.location),
      description: item.description,
      url,
      postedAt: null,
    });

    if (rawJobs.length >= MAX_JOBS_RETURNED) break;
  }

  return rawJobs.filter((job) => jobMatchesRoles(job, roles));
}
