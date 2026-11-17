import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  isNonHiringEmail,
  type ExportedJobMatch,
  type ExportPayload,
  type ResumeVariant,
} from "../lib/exportTopMatchesFormat";

export interface AdditionalRoleSummary {
  rank: number;
  title: string;
  companyName: string;
  portfolioFitScore: number;
  url: string;
}

export interface OutreachTargetInput {
  draftId: string;
  group: 1 | 2 | 3;
  rank: number;
  id: string;
  companyName: string;
  title: string;
  portfolioFitScore: number;
  recipientEmail: string;
  emailConfidence: string | null;
  resumeVariant: ResumeVariant;
  attachmentPath: string;
  recommendedPortfolioLinks: string[];
  locationRaw: string | null;
  minYears: number | null;
  salarySummary: string | null;
  url: string;
  careerPageUrl: string | null;
  websiteUrl: string | null;
  matchedSkills: string[];
  missingSkills: string[];
  recommendedResumeHooks: string[];
  aiReasoning: string | null;
  additionalRoles: AdditionalRoleSummary[];
  jdExcerpt: string;
}

export interface OutreachGroupFile {
  generatedAt: string;
  group: 1 | 2 | 3;
  groupTheme: string;
  targetCount: number;
  candidateFacts: {
    name: string;
    email: string;
    portfolioUrl: string;
    experienceSummary: string;
    education: string;
    locationAndAvailability: string;
    portfolioCaseStudies: Record<string, string>;
  };
  targets: OutreachTargetInput[];
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const DEFAULT_INPUT_JSON = join(REPO_ROOT, "reports/top-matches/all-live-matches.json");
const DEFAULT_OUTREACH_DIR = join(REPO_ROOT, "reports/outreach");
const DEFAULT_RESUME_SOURCE_DIR = process.env.PORTFOLIO_RESUME_DIR
  ? resolve(process.env.PORTFOLIO_RESUME_DIR)
  : resolve(REPO_ROOT, "../portfolio/resume");

const RESUME_VARIANTS: readonly { variant: ResumeVariant; sourceFile: string; pdfFile: string }[] = [
  {
    variant: "DotNet",
    sourceFile: "Sahidhullah_H_Resume_DotNet.md",
    pdfFile: "Sahidhullah-H-Resume-DotNet.pdf",
  },
  {
    variant: "FullStack",
    sourceFile: "Sahidhullah_H_Resume_FullStack.md",
    pdfFile: "Sahidhullah-H-Resume-FullStack.pdf",
  },
  {
    variant: "AI-Python",
    sourceFile: "Sahidhullah_H_Resume_AI-Python.md",
    pdfFile: "Sahidhullah-H-Resume-AI-Python.pdf",
  },
];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH ?? "",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderInlineMarkdown(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function markdownToResumeHtml(markdown: string, compact: boolean): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const bodyParts: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      bodyParts.push("</ul>");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (line === "---" || line === "***") {
      closeList();
      bodyParts.push("<hr>");
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      bodyParts.push(`<h1>${renderInlineMarkdown(line.slice(2).trim())}</h1>`);
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      bodyParts.push(`<h2>${renderInlineMarkdown(line.slice(3).trim())}</h2>`);
      continue;
    }
    if (line.startsWith("### ")) {
      closeList();
      bodyParts.push(`<h3>${renderInlineMarkdown(line.slice(4).trim())}</h3>`);
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        bodyParts.push("<ul>");
        inList = true;
      }
      bodyParts.push(`<li>${renderInlineMarkdown(line.slice(2).trim())}</li>`);
      continue;
    }
    closeList();
    bodyParts.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }
  closeList();

  const margin = compact ? "7.5mm 11.5mm" : "9mm 14mm";
  const fontSize = compact ? "8.8pt" : "9.5pt";
  const lineHeight = compact ? "1.22" : "1.27";
  const h1Size = compact ? "15.5pt" : "16.5pt";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: ${margin}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Calibri", "Segoe UI", Arial, sans-serif;
    font-size: ${fontSize};
    line-height: ${lineHeight};
    color: #111827;
  }
  h1 {
    font-size: ${h1Size};
    font-weight: 700;
    letter-spacing: 0.2px;
    color: #0f172a;
    margin-bottom: 2px;
  }
  h2 {
    font-size: 9.8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #1e3a8a;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 1.5px;
    margin-top: 7px;
    margin-bottom: 3.5px;
  }
  h3 {
    font-size: 9.4pt;
    font-weight: 700;
    color: #0f172a;
    margin-top: 4px;
    margin-bottom: 1.5px;
  }
  p { margin-bottom: 2.5px; }
  ul { padding-left: 14px; margin-bottom: 3px; }
  li { margin-bottom: 1.8px; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 4px 0; }
  a { color: #1d4ed8; text-decoration: none; }
  code { font-family: Consolas, monospace; font-size: 8.5pt; }
</style>
</head>
<body>
${bodyParts.join("\n")}
</body>
</html>`;
}

function findBrowserExecutable(): string | null {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function countPdfPages(pdfPath: string): number {
  const content = readFileSync(pdfPath, "latin1");
  const matches = content.match(/\/Type\s*\/Page\b(?!s)/g);
  return matches ? matches.length : 0;
}

function renderHtmlToPdf(browserExe: string, html: string, outPdfPath: string): void {
  const workDir = mkdtempSync(join(tmpdir(), "outreach-pdf-"));
  try {
    const htmlPath = join(workDir, "resume.html");
    const profileDir = join(workDir, "chrome-profile");
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(htmlPath, html, "utf8");

    execFileSync(
      browserExe,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-pdf-header-footer",
        `--user-data-dir=${profileDir}`,
        `--print-to-pdf=${outPdfPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: "pipe", timeout: 30000 },
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function isCachedSinglePagePdf(srcPath: string, outPdf: string): boolean {
  if (!existsSync(outPdf)) return false;
  const pdfStat = statSync(outPdf);
  const srcStat = statSync(srcPath);
  if (pdfStat.size < 2000 || pdfStat.mtimeMs < srcStat.mtimeMs) {
    return false;
  }
  return countPdfPages(outPdf) === 1;
}

export function renderResumePdfs(
  resumeSourceDir: string,
  resumesOutDir: string,
  forcePdf = false,
): Record<ResumeVariant, string> {
  mkdirSync(resumesOutDir, { recursive: true });
  let browserExe: string | null = null;

  const outPaths = {} as Record<ResumeVariant, string>;
  for (const entry of RESUME_VARIANTS) {
    const srcPath = join(resumeSourceDir, entry.sourceFile);
    if (!existsSync(srcPath)) {
      throw new Error(`Missing source resume markdown: ${srcPath}`);
    }
    const outPdf = join(resumesOutDir, entry.pdfFile);
    if (!forcePdf && isCachedSinglePagePdf(srcPath, outPdf)) {
      const sizeBytes = statSync(outPdf).size;
      console.log(`[prepare-outreach] Reused cached ${entry.pdfFile} (1 page, ${sizeBytes} bytes)`);
      outPaths[entry.variant] = `reports/outreach/resumes/${entry.pdfFile}`;
      continue;
    }

    browserExe ??= findBrowserExecutable();
    if (!browserExe) {
      throw new Error("Could not find Chrome or Edge executable to render 1-page resume PDFs.");
    }

    const md = readFileSync(srcPath, "utf8");
    renderHtmlToPdf(browserExe, markdownToResumeHtml(md, false), outPdf);
    let pages = countPdfPages(outPdf);
    if (pages > 1) {
      renderHtmlToPdf(browserExe, markdownToResumeHtml(md, true), outPdf);
      pages = countPdfPages(outPdf);
    }

    const sizeBytes = statSync(outPdf).size;
    if (sizeBytes < 2000 || pages < 1) {
      throw new Error(`Invalid PDF generated for ${entry.variant}: ${outPdf} (${sizeBytes} bytes, ${pages} pages)`);
    }
    console.log(`[prepare-outreach] Rendered ${entry.pdfFile} (${pages} page, ${sizeBytes} bytes)`);
    outPaths[entry.variant] = `reports/outreach/resumes/${entry.pdfFile}`;
  }

  return outPaths;
}

function compactExcerpt(description: string, maxChars = 1800): string {
  const clean = description.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 3).trimEnd()}...`;
}

function isNamedRecruiterInbox(email: string): boolean {
  const local = (email.split("@")[0] ?? "").toLowerCase();
  if (local.includes(".") || local.includes("_")) {
    const nonPersonalPrefixes = ["careers", "jobs", "talent", "recruit", "hiring", "hr", "team", "hello", "info"];
    return !nonPersonalPrefixes.some((p) => local.startsWith(p));
  }
  return false;
}

function isIndiaOrRemote(match: ExportedJobMatch): boolean {
  const loc = (match.locationRaw ?? "").toLowerCase();
  const tags = match.locationTags.map((t) => t.toLowerCase());
  return tags.includes("india") || tags.includes("remote") || /\b(india|bangalore|bengaluru|chennai|hyderabad|pune|remote)\b/i.test(loc);
}

function classifyPreferredGroup(match: ExportedJobMatch, email: string): 1 | 2 | 3 {
  if (isNamedRecruiterInbox(email)) {
    return 3;
  }
  if (isIndiaOrRemote(match) || match.recommendedResumeVariant === "DotNet" || match.recommendedResumeVariant === "AI-Python") {
    return 1;
  }
  return 2;
}

interface SendLedgerFile {
  entries?: Record<string, { recipientEmail?: string; status?: string }>;
}

export function loadSentEmailsFromLedger(ledgerPath: string): Set<string> {
  const sent = new Set<string>();
  if (!existsSync(ledgerPath)) return sent;
  const parsed = JSON.parse(readFileSync(ledgerPath, "utf8")) as SendLedgerFile;
  for (const entry of Object.values(parsed.entries ?? {})) {
    if (entry.status === "sent" && entry.recipientEmail) {
      sent.add(entry.recipientEmail.trim().toLowerCase());
    }
  }
  return sent;
}

export function deduplicateDirectTargets(
  matches: ExportedJobMatch[],
  excludeEmails: Set<string> = new Set(),
): Array<{
  primary: ExportedJobMatch;
  additionalRoles: AdditionalRoleSummary[];
}> {
  const sorted = [...matches].sort((a, b) => a.rank - b.rank || b.portfolioFitScore - a.portfolioFitScore);
  const byEmail = new Map<string, { primary: ExportedJobMatch; additionalRoles: AdditionalRoleSummary[] }>();

  for (const match of sorted) {
    const email = match.contactEmail?.trim();
    if (!email || isNonHiringEmail(email)) continue;
    const key = email.toLowerCase();
    if (excludeEmails.has(key)) continue;
    const existing = byEmail.get(key);
    if (!existing) {
      byEmail.set(key, { primary: match, additionalRoles: [] });
    } else if (existing.additionalRoles.length < 3) {
      existing.additionalRoles.push({
        rank: match.rank,
        title: match.title,
        companyName: match.companyName,
        portfolioFitScore: match.portfolioFitScore,
        url: match.url,
      });
    }
  }

  return [...byEmail.values()];
}

export function buildBalancedGroups(
  matches: ExportedJobMatch[],
  attachmentMap: Record<ResumeVariant, string>,
  maxTargets = 36,
  excludeEmails: Set<string> = new Set(),
): Record<1 | 2 | 3, OutreachTargetInput[]> {
  const unique = deduplicateDirectTargets(matches, excludeEmails).slice(0, maxTargets);
  const targetPerGroup = Math.ceil(unique.length / 3);
  const buckets: Record<1 | 2 | 3, Array<{ primary: ExportedJobMatch; additionalRoles: AdditionalRoleSummary[] }>> = {
    1: [],
    2: [],
    3: [],
  };

  const overflow: Array<{ primary: ExportedJobMatch; additionalRoles: AdditionalRoleSummary[] }> = [];

  for (const item of unique) {
    const email = item.primary.contactEmail?.trim() ?? "";
    const pref = classifyPreferredGroup(item.primary, email);
    if (buckets[pref].length < targetPerGroup) {
      buckets[pref].push(item);
    } else {
      overflow.push(item);
    }
  }

  const groupOrder: readonly (1 | 2 | 3)[] = [1, 2, 3];
  for (const item of overflow) {
    const targetGroup = groupOrder.find((g) => buckets[g].length < targetPerGroup) ?? 3;
    buckets[targetGroup].push(item);
  }

  const result: Record<1 | 2 | 3, OutreachTargetInput[]> = { 1: [], 2: [], 3: [] };
  for (const g of groupOrder) {
    result[g] = buckets[g].map((item, idx) => {
      const m = item.primary;
      const num = String(idx + 1).padStart(2, "0");
      return {
        draftId: `g${g}-${num}`,
        group: g,
        rank: m.rank,
        id: m.id,
        companyName: m.companyName,
        title: m.title,
        portfolioFitScore: m.portfolioFitScore,
        recipientEmail: m.contactEmail?.trim() ?? "",
        emailConfidence: m.contactEmailConfidence,
        resumeVariant: m.recommendedResumeVariant,
        attachmentPath: attachmentMap[m.recommendedResumeVariant],
        recommendedPortfolioLinks: m.recommendedPortfolioLinks,
        locationRaw: m.locationRaw,
        minYears: m.minYears,
        salarySummary: m.salarySummary,
        url: m.url,
        careerPageUrl: m.careerPageUrl,
        websiteUrl: m.websiteUrl,
        matchedSkills: m.matchedSkills,
        missingSkills: m.missingSkills,
        recommendedResumeHooks: m.recommendedResumeHooks,
        aiReasoning: m.aiReasoning ? m.aiReasoning.slice(0, 400) : null,
        additionalRoles: item.additionalRoles,
        jdExcerpt: compactExcerpt(m.description, 1800),
      };
    });
  }

  return result;
}

const CANDIDATE_FACTS: OutreachGroupFile["candidateFacts"] = {
  name: "Sahidhullah H",
  email: "sahidhullah@gmail.com",
  portfolioUrl: "https://sahidhh.github.io/portfolio/",
  experienceSummary:
    "2+ YOE full-time Software Development Engineer L2 at Propel Inc (Aug 2024 - Sep 2026; promoted to L2 in Aug 2026) working on enterprise C#/.NET Core APIs, Angular/TypeScript UIs, PostgreSQL, Azure, and internal AI/LLM document workflows. Previously Full-Stack & DevOps Intern at Mallow Technologies (Jun 2023 - Dec 2023) working on Laravel, AWS, and Azure DevOps CI/CD.",
  education: "B.E. Computer Science and Engineering (2024)",
  locationAndAvailability:
    "Based in Chennai, India. Immediate joiner. Open to remote, India relocation, or Singapore/overseas roles (requires visa/EP sponsorship for Singapore).",
  portfolioCaseStudies: {
    "job-pipeline": "https://sahidhh.github.io/portfolio/projects/job-pipeline.html",
    "pdf-diff": "https://sahidhh.github.io/portfolio/projects/pdf-diff.html",
    "profile-router": "https://sahidhh.github.io/portfolio/projects/profile-router.html",
    "freelance-radar": "https://sahidhh.github.io/portfolio/projects/freelance-radar.html",
    "pi-agentic": "https://sahidhh.github.io/portfolio/projects/pi-agentic.html",
  },
};

const GROUP_THEMES: Record<1 | 2 | 3, string> = {
  1: "India/Remote & top .NET / AI-Python engineering targets",
  2: "Singapore product & engineering consulting firms",
  3: "Named recruiters & specialist SG .NET / Python hiring inboxes",
};

function parsePrepareArgs(argv: string[]): {
  inputJson: string;
  outDir: string;
  count: number;
  includeSent: boolean;
  forcePdf: boolean;
} {
  let count = 36;
  let includeSent = false;
  let forcePdf = false;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--include-sent") {
      includeSent = true;
    } else if (arg === "--force-pdf") {
      forcePdf = true;
    } else if (arg === "--count") {
      const next = argv[i + 1];
      if (!next || !/^\d+$/.test(next) || Number(next) < 1) {
        throw new Error(`Invalid --count value "${next ?? ""}"`);
      }
      count = Number(next);
      i += 1;
    } else if (arg.startsWith("--count=")) {
      const val = arg.slice("--count=".length);
      if (!/^\d+$/.test(val) || Number(val) < 1) {
        throw new Error(`Invalid --count value "${val}"`);
      }
      count = Number(val);
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  return {
    inputJson: positional[0] ? resolve(positional[0]) : DEFAULT_INPUT_JSON,
    outDir: positional[1] ? resolve(positional[1]) : DEFAULT_OUTREACH_DIR,
    count,
    includeSent,
    forcePdf,
  };
}

function main(): void {
  const { inputJson, outDir, count, includeSent, forcePdf } = parsePrepareArgs(process.argv.slice(2));
  const resumesDir = join(outDir, "resumes");

  if (!existsSync(inputJson)) {
    throw new Error(`Missing exported jobs JSON: ${inputJson}. Run npm run export:matches first.`);
  }

  const ledgerPath = join(outDir, "send-ledger.json");
  const excludeEmails = includeSent ? new Set<string>() : loadSentEmailsFromLedger(ledgerPath);
  if (excludeEmails.size > 0) {
    console.log(`[prepare-outreach] Excluding ${excludeEmails.size} already-sent address(es) from ${ledgerPath}`);
  }

  const payload = JSON.parse(readFileSync(inputJson, "utf8")) as ExportPayload;
  const attachmentMap = renderResumePdfs(DEFAULT_RESUME_SOURCE_DIR, resumesDir, forcePdf);
  const groups = buildBalancedGroups(payload.matches, attachmentMap, count, excludeEmails);

  const generatedAt = new Date().toISOString();
  for (const g of [1, 2, 3] as const) {
    const filePayload: OutreachGroupFile = {
      generatedAt,
      group: g,
      groupTheme: GROUP_THEMES[g],
      targetCount: groups[g].length,
      candidateFacts: CANDIDATE_FACTS,
      targets: groups[g],
    };
    const outFile = join(outDir, `input-group-${g}.json`);
    writeFileSync(outFile, `${JSON.stringify(filePayload, null, 2)}\n`, "utf8");
    const sizeKb = (statSync(outFile).size / 1024).toFixed(1);
    console.log(`[prepare-outreach] Wrote ${outFile} (${groups[g].length} targets, ${sizeKb} KB)`);
  }
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isEntrypoint) {
  main();
}
