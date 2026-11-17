import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeCompanyName } from "@/features/companies/domain/normalizeCompanyName";
import { computeFingerprint } from "@/features/jobs/application/computeFingerprint";
import { extractContactEmail } from "@/features/jobs/domain/extractContactEmail";
import type { JobFilters, JobWithScore } from "@/features/jobs/domain/types";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { SCORING_QUEUE_CONFIG } from "@/features/scoring/domain/scoringQueueConfig";
import { LOCATION_TAGS, type LocationTag } from "@/shared/domain/enums";
import { optionalEnv } from "@/shared/infrastructure/env";
import { createSupabaseServiceClient, type TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Database } from "../supabase/database.types";
import {
  classifyScoreBand,
  comparePortfolioMatches,
  computeEffectiveScore,
  deriveResumeHooks,
  deriveSkillDiff,
  determineOutreachPath,
  extractAllContactEmails,
  formatSalarySummary,
  toCsvWithBom,
  toMarkdownSummary,
  toXlsxBuffer,
  type ExistingDraftSummary,
  type ExportedJobMatch,
  type ExportPayload,
  type MatchOrigin,
} from "./lib/exportTopMatchesFormat";
import { enrichMatchesWithContacts, loadDefaultVerifiedContacts } from "./enrich-export-contacts";
import { probeAndEnrichJobs, type JobProbeOutcome } from "./lib/jobLivenessAndEnrich";
import { computePortfolioFitScore } from "./lib/portfolioFitScorer";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type JobUpdateRow = Database["public"]["Tables"]["jobs"]["Update"];
type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
type CareerPageRow = Database["public"]["Tables"]["company_career_pages"]["Row"];
type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];

export type OriginScope = "all" | MatchOrigin;

export interface ExportTopMatchesOptions {
  limit: number;
  outDir: string;
  locationTags?: LocationTag[];
  remoteOnly?: boolean;
  origin: OriginScope;
  skipProbe?: boolean;
}

const DEFAULT_LIMIT = 500;
const DEFAULT_OUT_DIR = "reports/top-matches";
const QUERY_CANDIDATE_CAP = 1000;
const DB_CHUNK_SIZE = 100;

export function parseExportArgs(argv: readonly string[]): ExportTopMatchesOptions {
  let limit = DEFAULT_LIMIT;
  let outDir = DEFAULT_OUT_DIR;
  let locationTags: LocationTag[] | undefined;
  let remoteOnly: boolean | undefined;
  let origin: OriginScope = "all";
  let skipProbe = false;

  const rest = argv.slice();
  let token: string | undefined;
  while ((token = rest.shift()) !== undefined) {
    if (token === "--out-dir") {
      const val = rest.shift();
      if (!val) {
        throw new Error("--out-dir requires a directory path");
      }
      outDir = val;
    } else if (token === "--location") {
      const tag = (rest.shift() ?? "").toLowerCase();
      if (!(LOCATION_TAGS as readonly string[]).includes(tag)) {
        throw new Error(`--location must be one of: ${LOCATION_TAGS.join(", ")}`);
      }
      locationTags = [tag as LocationTag];
    } else if (token === "--remote") {
      remoteOnly = true;
    } else if (token === "--skip-probe") {
      skipProbe = true;
    } else if (token === "--origin") {
      const val = (rest.shift() ?? "").toLowerCase();
      if (val !== "all" && val !== "scraper" && val !== "claude_routine") {
        throw new Error("--origin must be one of: all, scraper, claude_routine");
      }
      origin = val;
    } else if (/^\d+$/.test(token)) {
      limit = Number(token);
      if (limit <= 0) {
        throw new Error("limit must be a positive integer");
      }
    } else {
      throw new Error(`Unknown argument: "${token}"`);
    }
  }

  return { limit, outDir, locationTags, remoteOnly, origin, skipProbe };
}

interface TaggedCandidate {
  origin: MatchOrigin;
  job: JobWithScore;
}

async function fetchJobsByIds(client: TypedSupabaseClient, ids: readonly string[]): Promise<Map<string, JobRow>> {
  const result = new Map<string, JobRow>();
  for (let i = 0; i < ids.length; i += DB_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + DB_CHUNK_SIZE);
    const { data, error } = await client.from("jobs").select("*").in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      result.set(row.id, row);
    }
  }
  return result;
}

async function fetchCompanies(
  client: TypedSupabaseClient,
): Promise<Pick<CompanyRow, "id" | "source" | "board_token" | "active">[]> {
  const { data, error } = await client.from("companies").select("id, source, board_token, active");
  if (error) throw error;
  return (data ?? []) as Pick<CompanyRow, "id" | "source" | "board_token" | "active">[];
}

async function fetchCareerPagesByCanonicalNames(
  client: TypedSupabaseClient,
  canonicalNames: readonly string[],
): Promise<Map<string, CareerPageRow>> {
  const result = new Map<string, CareerPageRow>();
  const unique = [...new Set(canonicalNames.filter((n) => n.trim().length > 0))];
  for (let i = 0; i < unique.length; i += DB_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + DB_CHUNK_SIZE);
    const { data, error } = await client
      .from("company_career_pages")
      .select("*")
      .in("canonical_company_name", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      result.set(row.canonical_company_name, row);
    }
  }
  return result;
}

async function fetchApplicationsByJobIds(
  client: TypedSupabaseClient,
  ids: readonly string[],
): Promise<Map<string, ExistingDraftSummary[]>> {
  const result = new Map<string, ExistingDraftSummary[]>();
  for (let i = 0; i < ids.length; i += DB_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + DB_CHUNK_SIZE);
    const { data, error } = await client
      .from("applications")
      .select("job_id, kind, subject, body, recipient_email, status")
      .in("job_id", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as Pick<
      ApplicationRow,
      "job_id" | "kind" | "subject" | "body" | "recipient_email" | "status"
    >[]) {
      const list = result.get(row.job_id) ?? [];
      list.push({
        kind: row.kind,
        subject: row.subject,
        body: row.body,
        recipientEmail: row.recipient_email,
        status: row.status,
      });
      result.set(row.job_id, list);
    }
  }
  return result;
}

async function persistProbeUpdates(
  client: TypedSupabaseClient,
  fullJobsMap: Map<string, JobRow>,
  outcomes: Map<string, JobProbeOutcome>,
): Promise<{ closedPrunedCount: number; dbEnrichedCount: number }> {
  const now = new Date().toISOString();
  const closedIds: string[] = [];
  const enrichedRows: { id: string; patch: JobUpdateRow }[] = [];

  for (const [jobId, outcome] of outcomes) {
    const row = fullJobsMap.get(jobId);
    if (!row) continue;

    if (!outcome.isLive) {
      closedIds.push(jobId);
      continue;
    }

    const patch: JobUpdateRow = {};
    let changed = false;

    if (outcome.enrichedCompanyName && outcome.enrichedCompanyName !== row.company_name) {
      patch.company_name = outcome.enrichedCompanyName;
      patch.canonical_company_name = normalizeCompanyName(outcome.enrichedCompanyName);
      patch.fingerprint = computeFingerprint({
        title: row.title,
        companyName: outcome.enrichedCompanyName,
        locationTags: row.location_tags,
      });
      row.company_name = patch.company_name;
      row.canonical_company_name = patch.canonical_company_name;
      changed = true;
    }

    if (outcome.enrichedDescription && outcome.enrichedDescription.length > row.description.length) {
      patch.description = outcome.enrichedDescription;
      row.description = outcome.enrichedDescription;
      changed = true;
    }

    if (outcome.enrichedUrl && outcome.enrichedUrl !== row.url) {
      patch.url = outcome.enrichedUrl;
      row.url = outcome.enrichedUrl;
      changed = true;
    }

    if (!row.contact_email && outcome.discoveredEmails.length > 0) {
      const extracted = extractContactEmail(outcome.discoveredEmails.join("\n"));
      if (extracted) {
        patch.contact_email = extracted.email;
        patch.contact_email_category = extracted.category;
        patch.contact_email_confidence = extracted.confidence;
        row.contact_email = extracted.email;
        row.contact_email_category = extracted.category;
        row.contact_email_confidence = extracted.confidence;
        changed = true;
      }
    }

    if (changed) {
      patch.updated_at = now;
      enrichedRows.push({ id: jobId, patch });
    }
  }

  for (let i = 0; i < closedIds.length; i += DB_CHUNK_SIZE) {
    const chunk = closedIds.slice(i, i + DB_CHUNK_SIZE);
    const { error } = await client
      .from("jobs")
      .update({ is_active: false, inactive_reason: "expired", updated_at: now })
      .in("id", chunk);
    if (error) throw error;
  }

  for (const item of enrichedRows) {
    const { error } = await client.from("jobs").update(item.patch).eq("id", item.id);
    if (error) {
      console.warn(`[export-top-matches] failed to persist enrichment for job ${item.id}: ${error.message}`);
    }
  }

  return { closedPrunedCount: closedIds.length, dbEnrichedCount: enrichedRows.length };
}

async function writeBundle(outDir: string, prefix: string, payload: ExportPayload): Promise<void> {
  const jsonContent = `${JSON.stringify(payload, null, 2)}\n`;
  const csvContent = toCsvWithBom(payload.matches);
  const xlsxBuffer = await toXlsxBuffer(payload.matches);
  const mdContent = toMarkdownSummary(payload);

  writeFileSync(join(outDir, `${prefix}-matches.json`), jsonContent, "utf8");
  writeFileSync(join(outDir, `${prefix}-matches.csv`), csvContent, "utf8");
  writeFileSync(join(outDir, `${prefix}-matches.xlsx`), xlsxBuffer);
  writeFileSync(join(outDir, `${prefix}-summary.md`), mdContent, "utf8");
}

export async function runExportTopMatches(options: ExportTopMatchesOptions): Promise<ExportPayload> {
  const client = createSupabaseServiceClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const resumeRepository = new SupabaseResumeRepository(client);
  const jobRepository = new SupabaseJobRepository(client);

  const roleSelection = await roleRepository.getActiveSelection();
  if (!roleSelection) {
    throw new Error("No active role selection found in Supabase (/roles). Cannot export matches.");
  }

  const activeResume = await resumeRepository.getActive();
  if (!activeResume) {
    throw new Error("No active resume found in Supabase (/resume). Cannot export matches.");
  }

  const keywordThreshold = Number(optionalEnv("KEYWORD_THRESHOLD", "0.25"));
  const candidatePoolSize = Math.max(options.limit, QUERY_CANDIDATE_CAP);

  const baseFilters: JobFilters = {
    locationTags: options.locationTags,
    remoteOnly: options.remoteOnly,
    includeWeakMatch: true,
    includeLowMatch: false,
  };

  const candidatesById = new Map<string, TaggedCandidate>();

  if (options.origin === "all" || options.origin === "scraper") {
    // Omit minAiScore so the LEFT JOIN keeps all 278 keyword-qualified
    // jobs stuck at ai_score=null alongside the AI-scored rows.
    const scraperPage = await jobRepository.findForDashboard(
      roleSelection.id,
      { ...baseFilters, origin: "scraper" },
      candidatePoolSize,
      activeResume.version,
      keywordThreshold,
      SCORING_QUEUE_CONFIG.maxAiRetries,
    );
    for (const job of scraperPage.jobs) {
      candidatesById.set(job.id, { origin: "scraper", job });
    }
  }

  if (options.origin === "all" || options.origin === "claude_routine") {
    const manualPage = await jobRepository.findForDashboard(
      roleSelection.id,
      { ...baseFilters, origin: "claude_routine", includeLowMatch: true },
      candidatePoolSize,
      activeResume.version,
      keywordThreshold,
      SCORING_QUEUE_CONFIG.maxAiRetries,
    );
    for (const job of manualPage.jobs) {
      if (!candidatesById.has(job.id)) {
        candidatesById.set(job.id, { origin: "claude_routine", job });
      }
    }
  }

  const allCandidates = [...candidatesById.values()];
  const candidateIds = allCandidates.map((c) => c.job.id);

  const [fullJobsMap, companies] = await Promise.all([
    fetchJobsByIds(client, candidateIds),
    fetchCompanies(client),
  ]);

  let outcomes = new Map<string, JobProbeOutcome>();
  let closedPrunedCount = 0;
  let dbEnrichedCount = 0;

  if (!options.skipProbe) {
    const allRows = [...fullJobsMap.values()];
    const probeResult = await probeAndEnrichJobs(allRows, companies);
    outcomes = probeResult.outcomes;
    console.log(
      `[export-top-matches] Liveness probe: ${probeResult.stats.liveCount} live, ` +
        `${probeResult.stats.closedCount} closed/expired, ` +
        `${probeResult.stats.enrichedCompanyCount} company names resolved, ` +
        `${probeResult.stats.enrichedDescriptionCount} descriptions expanded`,
    );

    const persisted = await persistProbeUpdates(client, fullJobsMap, outcomes);
    closedPrunedCount = persisted.closedPrunedCount;
    dbEnrichedCount = persisted.dbEnrichedCount;
    console.log(
      `[export-top-matches] Supabase updated: ${closedPrunedCount} marked expired, ${dbEnrichedCount} live rows enriched`,
    );
  }

  const liveCandidates = allCandidates.filter((c) => {
    const outcome = outcomes.get(c.job.id);
    return outcome ? outcome.isLive : true;
  });

  const liveIds = liveCandidates.map((c) => c.job.id);
  const canonicalNames = liveIds
    .map((id) => fullJobsMap.get(id)?.canonical_company_name ?? "")
    .filter(Boolean);

  const [careerPagesMap, draftsMap] = await Promise.all([
    fetchCareerPagesByCanonicalNames(client, canonicalNames),
    fetchApplicationsByJobIds(client, liveIds),
  ]);

  const scoredLive: ExportedJobMatch[] = liveCandidates.map((candidate) => {
    const { job } = candidate;
    const fullRow = fullJobsMap.get(job.id);
    const probe = outcomes.get(job.id);

    const description =
      (fullRow?.description && fullRow.description.trim().length > 0
        ? fullRow.description
        : fullRow?.manual_requirements) ?? "";
    const title = fullRow?.title ?? job.title;
    const companyName = fullRow?.company_name || job.companyName;
    const canonicalCompanyName = fullRow?.canonical_company_name || normalizeCompanyName(companyName);
    const jobText = `${title}\n${description}`;

    const knownEmail = fullRow?.contact_email ?? null;
    const allExtractedEmails = [...new Set([...(probe?.discoveredEmails ?? []), ...extractAllContactEmails(jobText, knownEmail)])];
    const primaryEmail = knownEmail ?? allExtractedEmails[0] ?? null;

    const careerPage = careerPagesMap.get(canonicalCompanyName);
    const careerPageUrl = careerPage?.career_page_url ?? null;
    const websiteUrl = careerPage?.website_url ?? probe?.enrichedWebsiteUrl ?? null;
    const outreachPath = determineOutreachPath(primaryEmail, allExtractedEmails, careerPageUrl);

    const { matchedSkills, missingSkills } = deriveSkillDiff(jobText, activeResume.skills, activeResume.parsedText);
    const recommendedResumeHooks = deriveResumeHooks(jobText, matchedSkills);

    const effectiveScore = computeEffectiveScore({
      origin: candidate.origin,
      overallScore: job.overallScore,
      aiScore: job.aiScore,
      manualScore: fullRow?.manual_score ?? job.manualScore,
    });
    const scoreBand = classifyScoreBand(effectiveScore);

    const portfolioFit = computePortfolioFitScore({
      title,
      description,
      locationRaw: fullRow?.location_raw ?? job.locationRaw,
      locationTags: fullRow?.location_tags ?? job.locationTags,
      minYears: fullRow?.min_years ?? job.minYears,
      visaSponsorship: fullRow?.visa_sponsorship ?? null,
      hasDirectEmail: Boolean(primaryEmail),
      aiScore: job.aiScore,
      keywordScore: job.keywordScore,
      manualScore: fullRow?.manual_score ?? job.manualScore,
    });

    return {
      rank: 0,
      id: job.id,
      origin: candidate.origin,
      source: fullRow?.source ?? job.source,
      companyName,
      canonicalCompanyName,
      title,
      portfolioFitScore: portfolioFit.portfolioFitScore,
      portfolioFitBreakdown: portfolioFit.portfolioFitBreakdown,
      recommendedResumeVariant: portfolioFit.recommendedResumeVariant,
      recommendedPortfolioLinks: portfolioFit.recommendedPortfolioLinks,
      effectiveScore,
      overallScore: job.overallScore,
      aiScore: job.aiScore,
      keywordScore: job.keywordScore,
      manualScore: fullRow?.manual_score ?? job.manualScore,
      scoreBand,
      overallScoreReasons: job.overallScoreReasons ?? [],
      aiReasoning: job.aiReasoning,
      manualStandout: fullRow?.manual_standout ?? job.manualStandout,
      manualVerify: fullRow?.manual_verify ?? job.manualVerify,
      manualRequirements: fullRow?.manual_requirements ?? job.manualRequirements,
      locationRaw: fullRow?.location_raw ?? job.locationRaw,
      locationTags: fullRow?.location_tags ?? job.locationTags,
      workArrangement: fullRow?.work_arrangement ?? null,
      seniority: fullRow?.seniority ?? null,
      minYears: fullRow?.min_years ?? job.minYears,
      employmentType: fullRow?.employment_type ?? null,
      salarySummary: fullRow
        ? formatSalarySummary({
            salaryCurrency: fullRow.salary_currency,
            salaryMin: fullRow.salary_min,
            salaryMax: fullRow.salary_max,
            salaryPeriod: fullRow.salary_period,
            salaryConfidence: fullRow.salary_confidence,
          })
        : null,
      visaSponsorship: fullRow?.visa_sponsorship ?? null,
      relocationAssistance: fullRow?.relocation_assistance ?? null,
      urgentHiring: fullRow?.urgent_hiring ?? false,
      statusLabel: job.statusLabel ?? "New",
      postedAt: fullRow?.posted_at ?? job.postedAt,
      firstSeenAt: fullRow?.first_seen_at ?? job.firstSeenAt,
      url: fullRow?.url ?? job.url,
      careerPageUrl,
      websiteUrl,
      contactEmail: primaryEmail,
      contactEmailCategory: fullRow?.contact_email_category ?? null,
      contactEmailConfidence: fullRow?.contact_email_confidence ?? null,
      allExtractedEmails,
      outreachPath,
      matchedSkills,
      missingSkills,
      recommendedResumeHooks,
      existingDrafts: draftsMap.get(job.id) ?? [],
      description,
    };
  });

  const enrichedLive = enrichMatchesWithContacts(
    scoredLive,
    activeResume.skills,
    loadDefaultVerifiedContacts(),
    activeResume.parsedText,
  );
  enrichedLive.sort(comparePortfolioMatches);

  const exportedMatches = enrichedLive.slice(0, options.limit).map((m, idx) => ({
    ...m,
    rank: idx + 1,
  }));

  const payload: ExportPayload = {
    generatedAt: new Date().toISOString(),
    roleSelection: {
      id: roleSelection.id,
      primaryRole: roleSelection.primaryRole,
      expandedRoles: roleSelection.expandedRoles,
    },
    resume: {
      id: activeResume.id,
      version: activeResume.version,
      skills: activeResume.skills,
    },
    liveness: options.skipProbe
      ? undefined
      : {
          totalProbed: outcomes.size,
          liveCount: liveCandidates.length,
          closedPrunedCount,
          dbEnrichedCount,
        },
    totalCandidatesEvaluated: allCandidates.length,
    exportedCount: exportedMatches.length,
    matches: exportedMatches,
  };

  mkdirSync(options.outDir, { recursive: true });

  await writeBundle(options.outDir, "all-live", payload);

  const top50Payload: ExportPayload = {
    ...payload,
    exportedCount: Math.min(50, exportedMatches.length),
    matches: exportedMatches.slice(0, 50),
  };
  await writeBundle(options.outDir, "top-50", top50Payload);

  // Also mirror `all-live` to `latest.*` for downstream tooling.
  const latestJson = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(join(options.outDir, "latest.json"), latestJson, "utf8");
  writeFileSync(join(options.outDir, "latest.csv"), toCsvWithBom(payload.matches), "utf8");
  writeFileSync(join(options.outDir, "latest.xlsx"), await toXlsxBuffer(payload.matches));
  writeFileSync(join(options.outDir, "latest.md"), toMarkdownSummary(payload), "utf8");

  console.log(
    `[export-top-matches] Exported ${exportedMatches.length} live portfolio-ranked matches ` +
      `(from ${allCandidates.length} candidates, ${closedPrunedCount} closed pruned) to ${options.outDir}/`,
  );

  for (const m of exportedMatches.slice(0, 20)) {
    const target = m.allExtractedEmails[0] ?? m.careerPageUrl ?? m.websiteUrl ?? m.url;
    console.log(
      `  #${String(m.rank).padStart(2)} [Fit ${String(m.portfolioFitScore).padStart(3)}/100 · ${m.recommendedResumeVariant.padEnd(9)}] ` +
        `${m.companyName || "—"} — ${m.title} (${target})`,
    );
  }

  return payload;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/export-top-matches.ts")) {
  const options = parseExportArgs(process.argv.slice(2));
  runExportTopMatches(options).catch((err) => {
    console.error("[export-top-matches] fatal error:", err);
    process.exit(1);
  });
}
