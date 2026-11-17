import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  compareMatchCandidates,
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

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type CareerPageRow = Database["public"]["Tables"]["company_career_pages"]["Row"];
type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];

export type OriginScope = "all" | MatchOrigin;

export interface ExportTopMatchesOptions {
  limit: number;
  outDir: string;
  locationTags?: LocationTag[];
  remoteOnly?: boolean;
  origin: OriginScope;
}

const DEFAULT_LIMIT = 50;
const DEFAULT_OUT_DIR = "reports/top-matches";
const QUERY_CANDIDATE_CAP = 200;
const DB_CHUNK_SIZE = 100;

export function parseExportArgs(argv: readonly string[]): ExportTopMatchesOptions {
  let limit = DEFAULT_LIMIT;
  let outDir = DEFAULT_OUT_DIR;
  let locationTags: LocationTag[] | undefined;
  let remoteOnly: boolean | undefined;
  let origin: OriginScope = "all";

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

  return { limit, outDir, locationTags, remoteOnly, origin };
}

interface TaggedCandidate {
  origin: MatchOrigin;
  job: JobWithScore;
  overallScore: number | null;
  aiScore: number | null;
  keywordScore: number | null;
  manualScore: number | null;
  postedAt: string | null;
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
  const candidatePoolSize = Math.max(options.limit * 4, QUERY_CANDIDATE_CAP);

  const baseFilters: JobFilters = {
    locationTags: options.locationTags,
    remoteOnly: options.remoteOnly,
    includeWeakMatch: true,
  };

  const candidatesById = new Map<string, TaggedCandidate>();

  if (options.origin === "all" || options.origin === "scraper") {
    const scraperPage = await jobRepository.findForDashboard(
      roleSelection.id,
      { ...baseFilters, origin: "scraper", minAiScore: 0 },
      candidatePoolSize,
      activeResume.version,
      keywordThreshold,
      SCORING_QUEUE_CONFIG.maxAiRetries,
    );
    for (const job of scraperPage.jobs) {
      candidatesById.set(job.id, {
        origin: "scraper",
        job,
        overallScore: job.overallScore,
        aiScore: job.aiScore,
        keywordScore: job.keywordScore,
        manualScore: job.manualScore,
        postedAt: job.postedAt,
      });
    }
  }

  if (options.origin === "all" || options.origin === "claude_routine") {
    const manualPage = await jobRepository.findForDashboard(
      roleSelection.id,
      { ...baseFilters, origin: "claude_routine" },
      candidatePoolSize,
      activeResume.version,
      keywordThreshold,
      SCORING_QUEUE_CONFIG.maxAiRetries,
    );
    for (const job of manualPage.jobs) {
      if (!candidatesById.has(job.id)) {
        candidatesById.set(job.id, {
          origin: "claude_routine",
          job,
          overallScore: job.overallScore,
          aiScore: job.aiScore,
          keywordScore: job.keywordScore,
          manualScore: job.manualScore,
          postedAt: job.postedAt,
        });
      }
    }
  }

  const allCandidates = [...candidatesById.values()].sort(compareMatchCandidates);
  const topCandidates = allCandidates.slice(0, options.limit);
  const topIds = topCandidates.map((c) => c.job.id);

  const fullJobsMap = await fetchJobsByIds(client, topIds);
  const canonicalNames = [...fullJobsMap.values()].map((r) => r.canonical_company_name);
  const [careerPagesMap, draftsMap] = await Promise.all([
    fetchCareerPagesByCanonicalNames(client, canonicalNames),
    fetchApplicationsByJobIds(client, topIds),
  ]);

  const matches: ExportedJobMatch[] = topCandidates.map((candidate, index) => {
    const { job } = candidate;
    const fullRow = fullJobsMap.get(job.id);
    const description =
      (fullRow?.description && fullRow.description.trim().length > 0
        ? fullRow.description
        : fullRow?.manual_requirements) ?? "";
    const title = fullRow?.title ?? job.title;
    const companyName = fullRow?.company_name ?? job.companyName;
    const canonicalCompanyName = fullRow?.canonical_company_name ?? companyName;
    const jobText = `${title}\n${description}`;

    const knownEmail = fullRow?.contact_email ?? null;
    const allExtractedEmails = extractAllContactEmails(jobText, knownEmail);
    const careerPage = careerPagesMap.get(canonicalCompanyName);
    const careerPageUrl = careerPage?.career_page_url ?? null;
    const websiteUrl = careerPage?.website_url ?? null;
    const outreachPath = determineOutreachPath(knownEmail, allExtractedEmails, careerPageUrl);

    const { matchedSkills, missingSkills } = deriveSkillDiff(jobText, activeResume.skills, activeResume.parsedText);
    const recommendedResumeHooks = deriveResumeHooks(jobText, matchedSkills);

    const effectiveScore = computeEffectiveScore(candidate);
    const scoreBand = classifyScoreBand(effectiveScore);

    return {
      rank: index + 1,
      id: job.id,
      origin: candidate.origin,
      source: fullRow?.source ?? job.source,
      companyName,
      canonicalCompanyName,
      title,
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
      contactEmail: knownEmail,
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
    totalCandidatesEvaluated: allCandidates.length,
    exportedCount: matches.length,
    matches,
  };

  mkdirSync(options.outDir, { recursive: true });

  const jsonContent = `${JSON.stringify(payload, null, 2)}\n`;
  const csvContent = toCsvWithBom(matches);
  const xlsxBuffer = await toXlsxBuffer(matches);
  const mdContent = toMarkdownSummary(payload);

  const prefix = `top-${options.limit}`;
  writeFileSync(join(options.outDir, `${prefix}-matches.json`), jsonContent, "utf8");
  writeFileSync(join(options.outDir, `${prefix}-matches.csv`), csvContent, "utf8");
  writeFileSync(join(options.outDir, `${prefix}-matches.xlsx`), xlsxBuffer);
  writeFileSync(join(options.outDir, `${prefix}-summary.md`), mdContent, "utf8");

  writeFileSync(join(options.outDir, "latest.json"), jsonContent, "utf8");
  writeFileSync(join(options.outDir, "latest.csv"), csvContent, "utf8");
  writeFileSync(join(options.outDir, "latest.xlsx"), xlsxBuffer);
  writeFileSync(join(options.outDir, "latest.md"), mdContent, "utf8");

  console.log(
    `[export-top-matches] Exported ${matches.length} of ${allCandidates.length} candidates to ${options.outDir}/ ` +
      `(role="${roleSelection.primaryRole}", resume=v${activeResume.version})`,
  );

  for (const m of matches.slice(0, 15)) {
    const scorePct = m.effectiveScore === null ? "—" : `${Math.round(m.effectiveScore * 100)}%`;
    const target = m.allExtractedEmails[0] ?? m.careerPageUrl ?? m.url;
    console.log(`  #${String(m.rank).padStart(2)} [${scorePct.padStart(4)} ${m.scoreBand.padEnd(8)}] ${m.companyName} — ${m.title} (${target})`);
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
