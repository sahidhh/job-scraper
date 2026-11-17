import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import type { Database } from "../../supabase/database.types";
import { extractAllContactEmails } from "./exportTopMatchesFormat";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];

export interface JobProbeOutcome {
  jobId: string;
  isLive: boolean;
  closedReason: string | null;
  enrichedCompanyName: string | null;
  enrichedWebsiteUrl: string | null;
  enrichedDescription: string | null;
  enrichedUrl: string | null;
  discoveredEmails: string[];
}

export interface LivenessProbeStats {
  totalProbed: number;
  liveCount: number;
  closedCount: number;
  enrichedCompanyCount: number;
  enrichedDescriptionCount: number;
  discoveredEmailCount: number;
}

const REQUEST_TIMEOUT_MS = 8000;
const PROBE_CONCURRENCY = 15;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const CLOSED_TITLE_PATTERN = /\b(page not found|job not found|404 not found|expired job)\b/i;
const CLOSED_BODY_PATTERN =
  /\b(this job has expired|this job is no longer available|job is no longer open|no longer accepting applications|position has been filled|this position is closed|job listing has expired|job has been closed|posting has been removed)\b/i;

function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || !trimmed.includes(".") || /^(na|n\/a|null|none|-)$/i.test(trimmed)) {
    return null;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function extractVisibleText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  return stripHtml(withoutScripts);
}

export function extractMailtoEmails(html: string): string[] {
  const matches = html.match(/mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi) ?? [];
  return matches.map((m) => m.slice("mailto:".length));
}

export function extractAdzunaFullDescription(html: string): string | null {
  const match = html.match(/<section[^>]*class="[^"]*adp-body[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
  if (!match?.[1]) return null;
  const cleaned = stripHtml(match[1]);
  return cleaned.length > 0 ? cleaned : null;
}

export function isExplicitlyClosedHtml(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = titleMatch?.[1] ? normalizeWhitespace(stripHtml(titleMatch[1])) : "";
  if (titleText && CLOSED_TITLE_PATTERN.test(titleText)) {
    return "closed_page_title";
  }

  const visible = extractVisibleText(html.slice(0, 60_000));
  if (CLOSED_BODY_PATTERN.test(visible)) {
    return "closed_page_banner";
  }

  return null;
}

async function fetchWithTimeout(
  url: string,
  fetchFn: typeof fetch,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchFn(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAtsBoardLiveIds(
  source: string,
  boardToken: string,
  fetchFn: typeof fetch,
): Promise<Set<string> | null> {
  let url: string | null = null;
  if (source === "greenhouse") {
    url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs`;
  } else if (source === "lever") {
    url = `https://api.lever.co/v0/postings/${encodeURIComponent(boardToken)}?mode=json`;
  } else if (source === "ashby") {
    url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardToken)}`;
  }

  if (!url) return null;

  try {
    const res = await fetchWithTimeout(url, fetchFn, {
      headers: { "User-Agent": "job-intelligence-platform" },
    });
    if (!res.ok) return null;

    const body: unknown = await res.json();
    if (source === "lever" && Array.isArray(body)) {
      return new Set(
        body
          .filter((item): item is { id: string } => typeof item === "object" && item !== null && typeof (item as { id?: unknown }).id === "string")
          .map((item) => item.id),
      );
    }

    if (typeof body === "object" && body !== null && Array.isArray((body as { jobs?: unknown }).jobs)) {
      const jobs = (body as { jobs: unknown[] }).jobs;
      const ids = new Set<string>();
      for (const item of jobs) {
        if (typeof item === "object" && item !== null) {
          const rawId = (item as { id?: unknown }).id;
          if (typeof rawId === "string" || typeof rawId === "number") {
            ids.add(String(rawId));
          }
        }
      }
      return ids;
    }
  } catch {
    return null;
  }

  return null;
}

interface McfDetailPayload {
  status?: { jobStatus?: string };
  metadata?: { expiryDate?: string };
  postedCompany?: { name?: string; companyUrl?: string | null; description?: string | null };
  hiringCompany?: { name?: string; companyUrl?: string | null; description?: string | null } | null;
  description?: string;
  externalJobUrl?: string | null;
}

async function probeMyCareersFutureJob(job: JobRow, fetchFn: typeof fetch): Promise<JobProbeOutcome> {
  const apiUrl = `https://api.mycareersfuture.gov.sg/v2/jobs/${encodeURIComponent(job.source_job_id)}`;
  try {
    const res = await fetchWithTimeout(apiUrl, fetchFn, {
      headers: { "User-Agent": "job-intelligence-platform" },
    });

    if (res.status === 404 || res.status === 410) {
      return {
        jobId: job.id,
        isLive: false,
        closedReason: `mcf_http_${res.status}`,
        enrichedCompanyName: null,
        enrichedWebsiteUrl: null,
        enrichedDescription: null,
        enrichedUrl: null,
        discoveredEmails: [],
      };
    }

    if (!res.ok) {
      return {
        jobId: job.id,
        isLive: true,
        closedReason: null,
        enrichedCompanyName: null,
        enrichedWebsiteUrl: null,
        enrichedDescription: null,
        enrichedUrl: null,
        discoveredEmails: [],
      };
    }

    const body = (await res.json()) as McfDetailPayload;
    const jobStatus = body.status?.jobStatus?.toLowerCase() ?? "";
    const expiryRaw = body.metadata?.expiryDate;
    const isExpiredByDate =
      typeof expiryRaw === "string" &&
      expiryRaw.length > 0 &&
      !Number.isNaN(Date.parse(expiryRaw)) &&
      Date.parse(`${expiryRaw}T23:59:59Z`) < Date.now();

    if (jobStatus === "closed" || isExpiredByDate) {
      return {
        jobId: job.id,
        isLive: false,
        closedReason: jobStatus === "closed" ? "mcf_status_closed" : "mcf_expiry_passed",
        enrichedCompanyName: null,
        enrichedWebsiteUrl: null,
        enrichedDescription: null,
        enrichedUrl: null,
        discoveredEmails: [],
      };
    }

    const companyName = normalizeWhitespace(
      body.hiringCompany?.name ?? body.postedCompany?.name ?? "",
    );
    const enrichedCompanyName =
      companyName.length > 0 && companyName !== job.company_name ? companyName : null;

    const enrichedWebsiteUrl = normalizeWebsiteUrl(
      body.hiringCompany?.companyUrl ?? body.postedCompany?.companyUrl,
    );
    const cleanedDesc = body.description ? stripHtml(body.description) : "";
    const enrichedDescription =
      cleanedDesc.length > job.description.length ? cleanedDesc : null;

    const enrichedUrl =
      body.externalJobUrl && body.externalJobUrl.trim().length > 0 && body.externalJobUrl !== job.url
        ? body.externalJobUrl.trim()
        : null;

    const emailText = [
      enrichedDescription ?? job.description,
      body.postedCompany?.description ? stripHtml(body.postedCompany.description) : "",
      body.hiringCompany?.description ? stripHtml(body.hiringCompany.description) : "",
    ].join("\n");
    const discoveredEmails = extractAllContactEmails(emailText, job.contact_email);

    return {
      jobId: job.id,
      isLive: true,
      closedReason: null,
      enrichedCompanyName,
      enrichedWebsiteUrl,
      enrichedDescription,
      enrichedUrl,
      discoveredEmails,
    };
  } catch {
    return {
      jobId: job.id,
      isLive: true,
      closedReason: null,
      enrichedCompanyName: null,
      enrichedWebsiteUrl: null,
      enrichedDescription: null,
      enrichedUrl: null,
      discoveredEmails: [],
    };
  }
}

async function probeGenericJobUrl(job: JobRow, fetchFn: typeof fetch): Promise<JobProbeOutcome> {
  try {
    const res = await fetchWithTimeout(job.url, fetchFn, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (res.status === 404 || res.status === 410) {
      return {
        jobId: job.id,
        isLive: false,
        closedReason: `http_${res.status}`,
        enrichedCompanyName: null,
        enrichedWebsiteUrl: null,
        enrichedDescription: null,
        enrichedUrl: null,
        discoveredEmails: [],
      };
    }

    if (!res.ok) {
      // Fail-open on 403/429/5xx so CloudFront/bot blocks do not delete live postings.
      return {
        jobId: job.id,
        isLive: true,
        closedReason: null,
        enrichedCompanyName: null,
        enrichedWebsiteUrl: null,
        enrichedDescription: null,
        enrichedUrl: null,
        discoveredEmails: [],
      };
    }

    const html = await res.text();
    const closedReason = isExplicitlyClosedHtml(html);
    if (closedReason) {
      return {
        jobId: job.id,
        isLive: false,
        closedReason,
        enrichedCompanyName: null,
        enrichedWebsiteUrl: null,
        enrichedDescription: null,
        enrichedUrl: null,
        discoveredEmails: [],
      };
    }

    let enrichedDescription: string | null = null;
    if (job.source === "adzuna" && job.description.length < 650) {
      const fullAdzuna = extractAdzunaFullDescription(html);
      if (fullAdzuna && fullAdzuna.length > job.description.length) {
        enrichedDescription = fullAdzuna;
      }
    }

    const emailCandidateText = [
      ...extractMailtoEmails(html),
      extractVisibleText(html.slice(0, 60_000)),
    ].join("\n");
    const discoveredEmails = extractAllContactEmails(emailCandidateText, job.contact_email);

    return {
      jobId: job.id,
      isLive: true,
      closedReason: null,
      enrichedCompanyName: null,
      enrichedWebsiteUrl: null,
      enrichedDescription,
      enrichedUrl: null,
      discoveredEmails,
    };
  } catch {
    return {
      jobId: job.id,
      isLive: true,
      closedReason: null,
      enrichedCompanyName: null,
      enrichedWebsiteUrl: null,
      enrichedDescription: null,
      enrichedUrl: null,
      discoveredEmails: [],
    };
  }
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const idx = nextIndex;
      nextIndex += 1;
      const item = items[idx]!;
      results[idx] = await worker(item);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

export async function probeAndEnrichJobs(
  jobs: readonly JobRow[],
  companies: readonly Pick<CompanyRow, "id" | "source" | "board_token" | "active">[],
  fetchFn: typeof fetch = fetch,
): Promise<{ outcomes: Map<string, JobProbeOutcome>; stats: LivenessProbeStats }> {
  const companyMap = new Map(companies.map((c) => [c.id, c]));

  // Pre-fetch live ATS job ID sets once per distinct company board.
  const boardKeys = new Map<string, { source: string; boardToken: string }>();
  for (const job of jobs) {
    if (
      (job.source === "greenhouse" || job.source === "lever" || job.source === "ashby") &&
      job.company_id
    ) {
      const co = companyMap.get(job.company_id);
      if (co?.board_token) {
        boardKeys.set(`${job.source}:${co.board_token}`, {
          source: job.source,
          boardToken: co.board_token,
        });
      }
    }
  }

  const boardLiveIds = new Map<string, Set<string> | null>();
  await runWithConcurrency([...boardKeys.entries()], 8, async ([key, meta]) => {
    const ids = await fetchAtsBoardLiveIds(meta.source, meta.boardToken, fetchFn);
    boardLiveIds.set(key, ids);
  });

  const probeList = await runWithConcurrency(jobs, PROBE_CONCURRENCY, async (job): Promise<JobProbeOutcome> => {
    if (job.source === "mycareersfuture") {
      return probeMyCareersFutureJob(job, fetchFn);
    }

    if (
      (job.source === "greenhouse" || job.source === "lever" || job.source === "ashby") &&
      job.company_id
    ) {
      const co = companyMap.get(job.company_id);
      if (co?.board_token) {
        const liveSet = boardLiveIds.get(`${job.source}:${co.board_token}`);
        if (liveSet) {
          if (!liveSet.has(job.source_job_id)) {
            return {
              jobId: job.id,
              isLive: false,
              closedReason: "not_on_ats_board",
              enrichedCompanyName: null,
              enrichedWebsiteUrl: null,
              enrichedDescription: null,
              enrichedUrl: null,
              discoveredEmails: [],
            };
          }
          return {
            jobId: job.id,
            isLive: true,
            closedReason: null,
            enrichedCompanyName: null,
            enrichedWebsiteUrl: null,
            enrichedDescription: null,
            enrichedUrl: null,
            discoveredEmails: extractAllContactEmails(`${job.title}\n${job.description}`, job.contact_email),
          };
        }
      }
    }

    return probeGenericJobUrl(job, fetchFn);
  });

  const outcomes = new Map<string, JobProbeOutcome>();
  let liveCount = 0;
  let closedCount = 0;
  let enrichedCompanyCount = 0;
  let enrichedDescriptionCount = 0;
  let discoveredEmailCount = 0;

  for (const outcome of probeList) {
    outcomes.set(outcome.jobId, outcome);
    if (outcome.isLive) {
      liveCount += 1;
      if (outcome.enrichedCompanyName) enrichedCompanyCount += 1;
      if (outcome.enrichedDescription) enrichedDescriptionCount += 1;
      if (outcome.discoveredEmails.length > 0) discoveredEmailCount += 1;
    } else {
      closedCount += 1;
    }
  }

  return {
    outcomes,
    stats: {
      totalProbed: probeList.length,
      liveCount,
      closedCount,
      enrichedCompanyCount,
      enrichedDescriptionCount,
      discoveredEmailCount,
    },
  };
}
