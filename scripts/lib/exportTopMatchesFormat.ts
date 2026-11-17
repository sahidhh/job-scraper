import JSZip from "jszip";
import { extractContactEmail } from "@/features/jobs/domain/extractContactEmail";
import { AI_SCORE_SHRUG, AI_SCORE_STRONG } from "@/features/scoring/domain/scoreBands";
import { SKILLS_DICTIONARY } from "@/shared/config/skills-dictionary";
import { extractSkills } from "@/shared/domain/skills";

export type ScoreBand = "strong" | "moderate" | "shrug" | "unscored";
export type OutreachPath = "direct_email" | "career_page" | "ats_board";
export type MatchOrigin = "scraper" | "claude_routine";

export interface ExistingDraftSummary {
  kind: string;
  subject: string;
  body: string;
  recipientEmail: string | null;
  status: string;
}

export interface ExportedJobMatch {
  rank: number;
  id: string;
  origin: MatchOrigin;
  source: string;
  companyName: string;
  canonicalCompanyName: string;
  title: string;
  effectiveScore: number | null;
  overallScore: number | null;
  aiScore: number | null;
  keywordScore: number | null;
  manualScore: number | null;
  scoreBand: ScoreBand;
  overallScoreReasons: string[];
  aiReasoning: string | null;
  manualStandout: string | null;
  manualVerify: string | null;
  manualRequirements: string | null;
  locationRaw: string;
  locationTags: string[];
  workArrangement: string | null;
  seniority: string | null;
  minYears: number | null;
  employmentType: string | null;
  salarySummary: string | null;
  visaSponsorship: boolean | null;
  relocationAssistance: boolean | null;
  urgentHiring: boolean;
  statusLabel: string;
  postedAt: string | null;
  firstSeenAt: string;
  url: string;
  careerPageUrl: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  contactEmailCategory: string | null;
  contactEmailConfidence: string | null;
  allExtractedEmails: string[];
  outreachPath: OutreachPath;
  matchedSkills: string[];
  missingSkills: string[];
  recommendedResumeHooks: string[];
  existingDrafts: ExistingDraftSummary[];
  description: string;
}

export interface ExportPayload {
  generatedAt: string;
  roleSelection: {
    id: string;
    primaryRole: string;
    expandedRoles: string[];
  };
  resume: {
    id: string;
    version: number;
    skills: string[];
  };
  totalCandidatesEvaluated: number;
  exportedCount: number;
  matches: ExportedJobMatch[];
}

export interface RawCandidateScores {
  origin: MatchOrigin;
  overallScore: number | null;
  aiScore: number | null;
  keywordScore: number | null;
  manualScore: number | null;
  postedAt: string | null;
}

export interface RawSalaryFields {
  salaryCurrency: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: string | null;
  salaryConfidence: string | null;
}

const EMAIL_SCAN_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

const AUTOMATED_EMAIL_PREFIXES = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "unsubscribe",
  "privacy",
  "mailer-daemon",
  "postmaster",
]);

interface ResumeHookRule {
  keywords: readonly string[];
  hook: string;
}

const RESUME_HOOK_RULES: readonly ResumeHookRule[] = [
  {
    keywords: [".net", "c#", "asp.net", "ef core", "entity framework", "cqrs", "mediatr", "clean architecture"],
    hook: "Propel .NET 8 CQRS + Clean Architecture migration (MediatR, EF Core, Unit of Work): cut new feature delivery from ~2 weeks to 4 days",
  },
  {
    keywords: ["postgresql", "postgres", "sql", "sql server", "database", "query", "performance", "optimization"],
    hook: "Propel PostgreSQL schema redesign (removed 6 redundant tables) & read-side query tuning (split queries, cut reporting endpoints from ~8s to <2s)",
  },
  {
    keywords: ["python", "ai", "llm", "machine learning", "ml", "azure", "fastapi", "openai", "claude", "agent", "document"],
    hook: "Propel PDF diff + LLM summary pipeline (.NET API + Azure Blob + Python worker, 500+ documents/cycle); built pi-lean micro-VM agent harness (40-70% token reduction)",
  },
  {
    keywords: ["angular", "angularjs", "rxjs"],
    hook: "Propel Angular side-by-side comparison UI with colour-coded diffs & 10+ shared components",
  },
  {
    keywords: ["react", "next.js", "typescript", "javascript", "redux", "node.js", "supabase"],
    hook: "Built Job Discovery Pipeline (Next.js, TypeScript, Supabase, two-stage AI scoring) & Mallow Technologies React/Redux time-tracking screens",
  },
  {
    keywords: ["rest", "api", "microservices", "healthcare", "e-commerce", "entra", "auth", "redis", "caching"],
    hook: "Healthcare & e-commerce platform: designed 20+ REST APIs (orders, appointments, payments, prescriptions) with caching cutting response times ~80%; owned 8+ modules incl. Entra ID auth",
  },
  {
    keywords: ["docker", "jenkins", "ci/cd", "aws", "git", "testing", "unit", "integration", "playwright"],
    hook: "Microservices tax platform experience; wrote unit, integration & Python load tests against staging/UAT; shipped builds with Docker, Jenkins, AWS, Azure, GitHub Actions",
  },
];

export function computeEffectiveScore(candidate: Pick<RawCandidateScores, "origin" | "overallScore" | "aiScore" | "manualScore">): number | null {
  if (candidate.origin === "claude_routine") {
    return candidate.manualScore === null ? null : candidate.manualScore / 100;
  }
  return candidate.overallScore ?? candidate.aiScore ?? null;
}

export function classifyScoreBand(effectiveScore: number | null): ScoreBand {
  if (effectiveScore === null) return "unscored";
  if (effectiveScore >= AI_SCORE_STRONG) return "strong";
  if (effectiveScore > AI_SCORE_SHRUG) return "moderate";
  return "shrug";
}

export function compareMatchCandidates<T extends RawCandidateScores>(a: T, b: T): number {
  const scoreA = computeEffectiveScore(a);
  const scoreB = computeEffectiveScore(b);

  if (scoreA !== scoreB) {
    if (scoreA === null) return 1;
    if (scoreB === null) return -1;
    return scoreB - scoreA;
  }

  const aiA = a.aiScore ?? (a.manualScore !== null ? a.manualScore / 100 : null);
  const aiB = b.aiScore ?? (b.manualScore !== null ? b.manualScore / 100 : null);
  if (aiA !== aiB) {
    if (aiA === null) return 1;
    if (aiB === null) return -1;
    return aiB - aiA;
  }

  const kwA = a.keywordScore ?? -1;
  const kwB = b.keywordScore ?? -1;
  if (kwA !== kwB) return kwB - kwA;

  const pa = a.postedAt ?? "";
  const pb = b.postedAt ?? "";
  return pa < pb ? 1 : pa > pb ? -1 : 0;
}

export function extractAllContactEmails(text: string, knownContactEmail: string | null): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const addIfValid = (email: string | null) => {
    if (!email) return;
    const trimmed = email.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) return;
    const localPart = trimmed.split("@")[0] ?? "";
    const localBase = (localPart.split("+")[0] ?? "").toLowerCase();
    if (AUTOMATED_EMAIL_PREFIXES.has(localBase)) return;
    seen.add(lower);
    ordered.push(trimmed);
  };

  addIfValid(knownContactEmail);
  const best = extractContactEmail(text);
  addIfValid(best?.email ?? null);

  const rawMatches = text.match(EMAIL_SCAN_REGEX) ?? [];
  for (const match of rawMatches) {
    addIfValid(match);
  }

  return ordered;
}

export function determineOutreachPath(
  contactEmail: string | null,
  allEmails: readonly string[],
  careerPageUrl: string | null,
): OutreachPath {
  if (contactEmail || allEmails.length > 0) return "direct_email";
  if (careerPageUrl) return "career_page";
  return "ats_board";
}

export function formatSalarySummary(salary: RawSalaryFields): string | null {
  const { salaryCurrency, salaryMin, salaryMax, salaryPeriod, salaryConfidence } = salary;
  if (salaryMin === null && salaryMax === null) {
    if (salaryConfidence === "low") return "Negotiable / unspecified (low)";
    return null;
  }

  const currency = salaryCurrency ? `${salaryCurrency} ` : "";
  let range = "";
  if (salaryMin !== null && salaryMax !== null && salaryMin !== salaryMax) {
    range = `${salaryMin.toLocaleString("en-US")} - ${salaryMax.toLocaleString("en-US")}`;
  } else {
    const single = salaryMin ?? salaryMax;
    range = single !== null ? single.toLocaleString("en-US") : "";
  }

  const period = salaryPeriod ? ` / ${salaryPeriod}` : "";
  const conf = salaryConfidence ? ` (${salaryConfidence})` : "";
  return `${currency}${range}${period}${conf}`.trim();
}

export function deriveSkillDiff(
  jobText: string,
  resumeSkills: readonly string[],
  resumeParsedText = "",
): { matchedSkills: string[]; missingSkills: string[] } {
  const jobSkills = extractSkills(jobText, SKILLS_DICTIONARY);
  const effectiveResumeSkills = new Set<string>(resumeSkills.map((s) => s.toLowerCase()));
  if (resumeParsedText) {
    for (const s of extractSkills(resumeParsedText, SKILLS_DICTIONARY)) {
      effectiveResumeSkills.add(s.toLowerCase());
    }
  }

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const skill of jobSkills) {
    if (effectiveResumeSkills.has(skill.toLowerCase())) {
      matchedSkills.push(skill);
    } else {
      missingSkills.push(skill);
    }
  }

  return { matchedSkills, missingSkills };
}

export function deriveResumeHooks(jobText: string, matchedSkills: readonly string[]): string[] {
  const haystack = `${jobText}\n${matchedSkills.join(" ")}`.toLowerCase();
  const hooks: string[] = [];

  for (const rule of RESUME_HOOK_RULES) {
    const hits = rule.keywords.some((kw) => haystack.includes(kw));
    if (hits) {
      hooks.push(rule.hook);
    }
  }

  if (hooks.length === 0) {
    hooks.push(RESUME_HOOK_RULES[0]!.hook);
    hooks.push(RESUME_HOOK_RULES[5]!.hook);
  }

  return hooks.slice(0, 4);
}

const CSV_COLUMNS = [
  "rank",
  "score_pct",
  "score_band",
  "origin",
  "source",
  "company_name",
  "title",
  "location_raw",
  "location_tags",
  "work_arrangement",
  "seniority",
  "min_years",
  "employment_type",
  "salary_summary",
  "visa_sponsorship",
  "outreach_path",
  "contact_email",
  "contact_email_category",
  "contact_email_confidence",
  "all_extracted_emails",
  "url",
  "career_page_url",
  "website_url",
  "status_label",
  "posted_at",
  "ai_score",
  "keyword_score",
  "manual_score",
  "overall_score_reasons",
  "matched_skills",
  "missing_skills",
  "recommended_resume_hooks",
  "ai_reasoning_or_standout",
  "manual_verify",
  "existing_draft_status",
  "description",
] as const;

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatScorePct(score: number | null): string {
  return score === null ? "" : `${Math.round(score * 100)}%`;
}

function matchToCsvRecord(match: ExportedJobMatch): Record<(typeof CSV_COLUMNS)[number], string> {
  const reasoning = [match.aiReasoning, match.manualStandout].filter(Boolean).join(" | ");
  const draftSummary = match.existingDrafts.map((d) => `${d.kind}:${d.status}`).join(", ");
  return {
    rank: String(match.rank),
    score_pct: formatScorePct(match.effectiveScore),
    score_band: match.scoreBand,
    origin: match.origin,
    source: match.source,
    company_name: match.companyName,
    title: match.title,
    location_raw: match.locationRaw,
    location_tags: match.locationTags.join(", "),
    work_arrangement: match.workArrangement ?? "",
    seniority: match.seniority ?? "",
    min_years: match.minYears === null ? "" : String(match.minYears),
    employment_type: match.employmentType ?? "",
    salary_summary: match.salarySummary ?? "",
    visa_sponsorship: match.visaSponsorship === null ? "" : String(match.visaSponsorship),
    outreach_path: match.outreachPath,
    contact_email: match.contactEmail ?? "",
    contact_email_category: match.contactEmailCategory ?? "",
    contact_email_confidence: match.contactEmailConfidence ?? "",
    all_extracted_emails: match.allExtractedEmails.join("; "),
    url: match.url,
    career_page_url: match.careerPageUrl ?? "",
    website_url: match.websiteUrl ?? "",
    status_label: match.statusLabel,
    posted_at: match.postedAt ?? "",
    ai_score: match.aiScore === null ? "" : String(match.aiScore),
    keyword_score: match.keywordScore === null ? "" : String(match.keywordScore),
    manual_score: match.manualScore === null ? "" : String(match.manualScore),
    overall_score_reasons: match.overallScoreReasons.join("; "),
    matched_skills: match.matchedSkills.join(", "),
    missing_skills: match.missingSkills.join(", "),
    recommended_resume_hooks: match.recommendedResumeHooks.join(" | "),
    ai_reasoning_or_standout: reasoning,
    manual_verify: match.manualVerify ?? "",
    existing_draft_status: draftSummary,
    description: match.description,
  };
}

export function toCsvWithBom(matches: readonly ExportedJobMatch[]): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const match of matches) {
    const row = matchToCsvRecord(match);
    lines.push(CSV_COLUMNS.map((col) => escapeCsvCell(row[col])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

const MAX_EXCEL_CELL_CHARS = 32000;

function sanitizeXmlText(value: string): string {
  // Strip XML 1.0 illegal control characters while preserving tab, LF, CR.
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");
  const bounded =
    cleaned.length > MAX_EXCEL_CELL_CHARS
      ? `${cleaned.slice(0, MAX_EXCEL_CELL_CHARS - 14)}… [truncated]`
      : cleaned;
  return bounded
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnLetters(indexZeroBased: number): string {
  let n = indexZeroBased + 1;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

interface SheetColumnSpec {
  header: string;
  width: number;
}

function buildWorksheetXml(
  columns: readonly SheetColumnSpec[],
  rows: readonly (readonly (string | number | null)[])[],
): string {
  const colsXml = columns
    .map((col, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${col.width}" customWidth="1"/>`)
    .join("");

  const headerCells = columns
    .map((col, colIdx) => {
      const ref = `${columnLetters(colIdx)}1`;
      return `<c r="${ref}" s="1" t="inlineStr"><is><t xml:space="preserve">${sanitizeXmlText(col.header)}</t></is></c>`;
    })
    .join("");

  const dataRowsXml = rows
    .map((cells, rowOffset) => {
      const rowNum = rowOffset + 2;
      const cellXml = cells
        .map((val, colIdx) => {
          const ref = `${columnLetters(colIdx)}${rowNum}`;
          if (val === null || val === "") {
            return `<c r="${ref}" s="2"/>`;
          }
          if (typeof val === "number" && Number.isFinite(val)) {
            return `<c r="${ref}" s="2"><v>${val}</v></c>`;
          }
          return `<c r="${ref}" s="2" t="inlineStr"><is><t xml:space="preserve">${sanitizeXmlText(String(val))}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNum}">${cellXml}</row>`;
    })
    .join("");

  const lastCol = columnLetters(Math.max(0, columns.length - 1));
  const lastRow = rows.length + 1;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="18"/>` +
    `<cols>${colsXml}</cols>` +
    `<sheetData><row r="1" ht="22" customHeight="1">${headerCells}</row>${dataRowsXml}</sheetData>` +
    `<autoFilter ref="A1:${lastCol}${lastRow}"/>` +
    `</worksheet>`
  );
}

export async function toXlsxBuffer(matches: readonly ExportedJobMatch[]): Promise<Buffer> {
  const zip = new JSZip();

  const sheet1Cols: readonly SheetColumnSpec[] = [
    { header: "Rank", width: 7 },
    { header: "Score %", width: 10 },
    { header: "Band", width: 11 },
    { header: "Origin", width: 15 },
    { header: "Source", width: 15 },
    { header: "Company", width: 26 },
    { header: "Role Title", width: 36 },
    { header: "Location", width: 24 },
    { header: "Location Tags", width: 18 },
    { header: "Work Arrangement", width: 16 },
    { header: "Seniority", width: 12 },
    { header: "Min YOE", width: 9 },
    { header: "Employment Type", width: 15 },
    { header: "Salary", width: 24 },
    { header: "Visa Sponsorship", width: 15 },
    { header: "Outreach Path", width: 14 },
    { header: "Contact Email", width: 30 },
    { header: "Email Category", width: 16 },
    { header: "Email Confidence", width: 15 },
    { header: "All Emails Found", width: 32 },
    { header: "Apply URL", width: 45 },
    { header: "Career Page URL", width: 38 },
    { header: "Website URL", width: 30 },
    { header: "Status", width: 14 },
    { header: "Posted At", width: 22 },
    { header: "Matched Skills", width: 36 },
    { header: "Missing Skills", width: 32 },
    { header: "Description", width: 70 },
  ];

  const sheet1Rows = matches.map((m) => [
    m.rank,
    m.effectiveScore === null ? null : Math.round(m.effectiveScore * 100),
    m.scoreBand,
    m.origin,
    m.source,
    m.companyName,
    m.title,
    m.locationRaw,
    m.locationTags.join(", "),
    m.workArrangement,
    m.seniority,
    m.minYears,
    m.employmentType,
    m.salarySummary,
    m.visaSponsorship === null ? null : String(m.visaSponsorship),
    m.outreachPath,
    m.contactEmail,
    m.contactEmailCategory,
    m.contactEmailConfidence,
    m.allExtractedEmails.join("; "),
    m.url,
    m.careerPageUrl,
    m.websiteUrl,
    m.statusLabel,
    m.postedAt,
    m.matchedSkills.join(", "),
    m.missingSkills.join(", "),
    m.description,
  ]);

  const sheet2Cols: readonly SheetColumnSpec[] = [
    { header: "Rank", width: 7 },
    { header: "Score %", width: 10 },
    { header: "Company", width: 26 },
    { header: "Role Title", width: 36 },
    { header: "Contact Email", width: 30 },
    { header: "Apply / Career URL", width: 45 },
    { header: "Matched Skills", width: 36 },
    { header: "Missing Skills", width: 32 },
    { header: "Recommended Resume Hooks", width: 65 },
    { header: "AI Reasoning / Standout", width: 60 },
    { header: "Verify Before Applying", width: 45 },
    { header: "Existing Drafts", width: 30 },
  ];

  const sheet2Rows = matches.map((m) => [
    m.rank,
    m.effectiveScore === null ? null : Math.round(m.effectiveScore * 100),
    m.companyName,
    m.title,
    m.allExtractedEmails.join("; ") || m.contactEmail,
    m.careerPageUrl ?? m.url,
    m.matchedSkills.join(", "),
    m.missingSkills.join(", "),
    m.recommendedResumeHooks.join("\n"),
    [m.aiReasoning, m.manualStandout].filter(Boolean).join("\n"),
    m.manualVerify,
    m.existingDrafts.map((d) => `[${d.kind}:${d.status}] ${d.subject}`).join("\n"),
  ]);

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    `<sheet name="Top Matches" sheetId="1" r:id="rId1"/>` +
    `<sheet name="Tailoring Playbook" sheetId="2" r:id="rId2"/>` +
    `</sheets>` +
    `</workbook>`;

  const workbookRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2">` +
    `<font><sz val="10"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="3">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="3">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
    `</cellXfs>` +
    `</styleSheet>`;

  zip.file("[Content_Types].xml", contentTypesXml);
  zip.file("_rels/.rels", rootRelsXml);
  zip.file("xl/workbook.xml", workbookXml);
  zip.file("xl/_rels/workbook.xml.rels", workbookRelsXml);
  zip.file("xl/styles.xml", stylesXml);
  zip.file("xl/worksheets/sheet1.xml", buildWorksheetXml(sheet1Cols, sheet1Rows));
  zip.file("xl/worksheets/sheet2.xml", buildWorksheetXml(sheet2Cols, sheet2Rows));

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function escapeMdCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function toMarkdownSummary(payload: ExportPayload): string {
  const strongCount = payload.matches.filter((m) => m.scoreBand === "strong").length;
  const moderateCount = payload.matches.filter((m) => m.scoreBand === "moderate").length;
  const shrugCount = payload.matches.filter((m) => m.scoreBand === "shrug").length;
  const directEmailCount = payload.matches.filter((m) => m.outreachPath === "direct_email").length;
  const careerPageCount = payload.matches.filter((m) => m.outreachPath === "career_page").length;
  const manualCount = payload.matches.filter((m) => m.origin === "claude_routine").length;

  const lines: string[] = [
    `# Top ${payload.exportedCount} Job Matches`,
    "",
    `- Generated: ${payload.generatedAt}`,
    `- Active role: ${payload.roleSelection.primaryRole} (${payload.roleSelection.expandedRoles.length} expanded roles)`,
    `- Active resume: v${payload.resume.version} (${payload.resume.skills.length} extracted skills)`,
    `- Candidates evaluated: ${payload.totalCandidatesEvaluated}`,
    `- Breakdown: ${strongCount} strong (>=75%), ${moderateCount} moderate (>40%), ${shrugCount} shrug/low (<=40%)`,
    `- Origins: ${payload.exportedCount - manualCount} automated scraper, ${manualCount} claude_routine`,
    `- Outreach paths: ${directEmailCount} direct email, ${careerPageCount} career page, ${payload.exportedCount - directEmailCount - careerPageCount} ATS/apply URL only`,
    "",
    "| # | Score | Band | Company | Role | Location | Outreach | Email / Target | Matched Skills |",
    "|---|---|---|---|---|---|---|---|---|",
  ];

  for (const m of payload.matches) {
    const score = formatScorePct(m.effectiveScore) || "—";
    const target = m.allExtractedEmails[0] ?? m.careerPageUrl ?? m.url;
    lines.push(
      `| ${m.rank} | ${score} | ${m.scoreBand} | ${escapeMdCell(m.companyName)} | ${escapeMdCell(m.title)} | ${escapeMdCell(m.locationRaw || m.locationTags.join(","))} | ${m.outreachPath} | ${escapeMdCell(target)} | ${escapeMdCell(m.matchedSkills.slice(0, 6).join(", "))} |`,
    );
  }

  lines.push("");
  return lines.join("\n");
}
