import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCompanyName } from "@/features/companies/domain/normalizeCompanyName";
import { extractContactEmail } from "@/features/jobs/domain/extractContactEmail";
import {
  comparePortfolioMatches,
  deriveResumeHooks,
  deriveSkillDiff,
  determineOutreachPath,
  isNonHiringEmail,
  toCsvWithBom,
  toMarkdownSummary,
  toXlsxBuffer,
  type ExportedJobMatch,
  type ExportPayload,
} from "./lib/exportTopMatchesFormat";
import { computePortfolioFitScore } from "./lib/portfolioFitScorer";

export interface DiscoveredEmailEntry {
  email: string;
  confidence: "HIGH" | "MEDIUM" | "ROLE" | null;
  source: string;
}

export interface CompanyContactEnrichment {
  rank?: number;
  company: string;
  matchTitleSubstring?: string;
  websiteUrl: string | null;
  careerPageUrl: string | null;
  emails: DiscoveredEmailEntry[];
  directJobUrl?: string | null;
  fullDescription?: string | null;
  extraNotes?: string | null;
}

function mapConfidence(c: "HIGH" | "MEDIUM" | "ROLE" | null): "high" | "medium" | "low" {
  if (c === "HIGH") return "high";
  if (c === "ROLE" || c === "MEDIUM") return "medium";
  return "low";
}

function normalizeLookupKey(name: string): string {
  return normalizeCompanyName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function loadDefaultVerifiedContacts(): CompanyContactEnrichment[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, "lib", "verifiedCompanyContacts.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")) as CompanyContactEnrichment[];
}

export function enrichMatchesWithContacts(
  matches: readonly ExportedJobMatch[],
  resumeSkills: readonly string[],
  records: readonly CompanyContactEnrichment[],
  resumeParsedText = "",
): ExportedJobMatch[] {
  const byCompanyKey = new Map<string, CompanyContactEnrichment[]>();

  for (const rec of records) {
    const key = normalizeLookupKey(rec.company);
    if (!key) continue;
    const list = byCompanyKey.get(key) ?? [];
    list.push(rec);
    byCompanyKey.set(key, list);
  }

  return matches.map((match) => {
    const candidates = byCompanyKey.get(normalizeLookupKey(match.companyName)) ?? [];
    const rec =
      candidates.find(
        (c) =>
          (c.rank !== undefined && c.rank === match.rank) ||
          (c.matchTitleSubstring !== undefined &&
            match.title.toLowerCase().includes(c.matchTitleSubstring.toLowerCase())),
      ) ?? candidates.find((c) => c.rank === undefined && c.matchTitleSubstring === undefined) ?? candidates[0];

    const cleanedExistingEmails = match.allExtractedEmails.filter((e) => !isNonHiringEmail(e));

    if (!rec) {
      return {
        ...match,
        allExtractedEmails: cleanedExistingEmails,
        contactEmail: cleanedExistingEmails[0] ?? null,
        outreachPath: determineOutreachPath(
          cleanedExistingEmails[0] ?? null,
          cleanedExistingEmails,
          match.careerPageUrl,
        ),
      };
    }

    const isRoleSpecificMatch =
      (rec.rank === undefined && rec.matchTitleSubstring === undefined) ||
      (rec.rank !== undefined && rec.rank === match.rank) ||
      (rec.matchTitleSubstring !== undefined &&
        match.title.toLowerCase().includes(rec.matchTitleSubstring.toLowerCase()));

    const mergedEmails = [
      ...new Set([
        ...cleanedExistingEmails,
        ...rec.emails
          .map((e) => e.email.trim())
          .filter((e) => Boolean(e) && !isNonHiringEmail(e)),
      ]),
    ];

    const primaryEmail = mergedEmails[0] ?? null;
    const primaryEmailMeta = rec.emails.find(
      (e) => e.email.toLowerCase() === (primaryEmail ?? "").toLowerCase(),
    );
    const extractedCat = primaryEmail ? extractContactEmail(primaryEmail) : null;

    const websiteUrl = match.websiteUrl ?? rec.websiteUrl ?? null;
    const careerPageUrl = match.careerPageUrl ?? rec.careerPageUrl ?? null;
    const directUrl =
      isRoleSpecificMatch && rec.directJobUrl && rec.directJobUrl.startsWith("http")
        ? rec.directJobUrl
        : match.url;
    const description =
      isRoleSpecificMatch && rec.fullDescription && rec.fullDescription.length > match.description.length
        ? rec.fullDescription
        : match.description;

    const jobText = `${match.title}\n${description}`;
    const { matchedSkills, missingSkills } = deriveSkillDiff(jobText, resumeSkills, resumeParsedText);
    const recommendedResumeHooks = deriveResumeHooks(jobText, matchedSkills);

    const fit = computePortfolioFitScore({
      title: match.title,
      description,
      locationRaw: match.locationRaw,
      locationTags: match.locationTags,
      minYears: match.minYears,
      visaSponsorship: match.visaSponsorship,
      hasDirectEmail: Boolean(primaryEmail),
      aiScore: match.aiScore,
      keywordScore: match.keywordScore,
      manualScore: match.manualScore,
    });

    return {
      ...match,
      url: directUrl,
      description,
      websiteUrl,
      careerPageUrl,
      contactEmail: primaryEmail,
      contactEmailCategory: extractedCat?.category ?? match.contactEmailCategory,
      contactEmailConfidence: primaryEmailMeta
        ? mapConfidence(primaryEmailMeta.confidence)
        : (extractedCat?.confidence ?? match.contactEmailConfidence),
      allExtractedEmails: mergedEmails,
      outreachPath: determineOutreachPath(primaryEmail, mergedEmails, careerPageUrl),
      matchedSkills,
      missingSkills,
      recommendedResumeHooks,
      portfolioFitScore: fit.portfolioFitScore,
      portfolioFitBreakdown: fit.portfolioFitBreakdown,
      recommendedResumeVariant: fit.recommendedResumeVariant,
      recommendedPortfolioLinks: fit.recommendedPortfolioLinks,
    };
  });
}

export async function applyEnrichmentToExports(
  outDir: string,
  records: readonly CompanyContactEnrichment[],
): Promise<ExportPayload> {
  const allLivePath = join(outDir, "all-live-matches.json");
  if (!existsSync(allLivePath)) {
    throw new Error(`Missing ${allLivePath}. Run npm run fetch:matches first.`);
  }

  const payload = JSON.parse(readFileSync(allLivePath, "utf8")) as ExportPayload;
  const enrichedMatches = enrichMatchesWithContacts(payload.matches, payload.resume.skills, records);

  enrichedMatches.sort(comparePortfolioMatches);
  const reranked = enrichedMatches.map((m, idx) => ({ ...m, rank: idx + 1 }));

  const updatedPayload: ExportPayload = {
    ...payload,
    generatedAt: new Date().toISOString(),
    exportedCount: reranked.length,
    matches: reranked,
  };

  const writeFiles = async (prefix: string, p: ExportPayload) => {
    writeFileSync(join(outDir, `${prefix}-matches.json`), `${JSON.stringify(p, null, 2)}\n`, "utf8");
    writeFileSync(join(outDir, `${prefix}-matches.csv`), toCsvWithBom(p.matches), "utf8");
    writeFileSync(join(outDir, `${prefix}-matches.xlsx`), await toXlsxBuffer(p.matches));
    writeFileSync(join(outDir, `${prefix}-summary.md`), toMarkdownSummary(p), "utf8");
  };

  await writeFiles("all-live", updatedPayload);

  const top50Payload: ExportPayload = {
    ...updatedPayload,
    exportedCount: Math.min(50, reranked.length),
    matches: reranked.slice(0, 50),
  };
  await writeFiles("top-50", top50Payload);

  writeFileSync(join(outDir, "latest.json"), `${JSON.stringify(updatedPayload, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "latest.csv"), toCsvWithBom(updatedPayload.matches), "utf8");
  writeFileSync(join(outDir, "latest.xlsx"), await toXlsxBuffer(updatedPayload.matches));
  writeFileSync(join(outDir, "latest.md"), toMarkdownSummary(updatedPayload), "utf8");

  return updatedPayload;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/enrich-export-contacts.ts")) {
  const customPath = process.argv[2];
  const outDir = process.argv[3] ?? "reports/top-matches";
  const records = customPath
    ? (JSON.parse(readFileSync(customPath, "utf8")) as CompanyContactEnrichment[])
    : loadDefaultVerifiedContacts();
  applyEnrichmentToExports(outDir, records)
    .then((p) => {
      const top50 = p.matches.slice(0, 50);
      const withEmail = top50.filter((m) => m.allExtractedEmails.length > 0).length;
      const withCareerOrWeb = top50.filter((m) => Boolean(m.careerPageUrl || m.websiteUrl)).length;
      console.log(
        `[enrich-export-contacts] Updated ${p.matches.length} live matches. Top 50: ${withEmail}/50 have direct emails, ${withCareerOrWeb}/50 have company website/career URL.`,
      );
    })
    .catch((err) => {
      console.error("[enrich-export-contacts] fatal:", err);
      process.exit(1);
    });
}
