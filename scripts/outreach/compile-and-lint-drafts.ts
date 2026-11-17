import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isNonHiringEmail, type ResumeVariant } from "../lib/exportTopMatchesFormat";
import type { OutreachGroupFile } from "./prepare-outreach-groups";

export interface DraftEmailItem {
  draftId: string;
  group: 1 | 2 | 3;
  rank: number;
  companyName: string;
  title: string;
  recipientEmail: string;
  emailConfidence: string;
  resumeVariant: ResumeVariant;
  attachmentPath: string;
  subject: string;
  body: string;
  matchedSkills: string[];
  portfolioLinkUsed: string;
}

export interface DraftGroupOutput {
  group: 1 | 2 | 3;
  generatedAt: string;
  drafts: DraftEmailItem[];
}

export interface CompiledOutreachPayload {
  generatedAt: string;
  totalDrafts: number;
  variantCounts: Record<ResumeVariant, number>;
  drafts: DraftEmailItem[];
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const DEFAULT_OUTREACH_DIR = join(REPO_ROOT, "reports/outreach");

const BANNED_AI_PHRASES: readonly RegExp[] = [
  /\bdelve\b/i,
  /\btapestry\b/i,
  /\bstreamline\b/i,
  /\bgame-changer\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bleverage\b/i,
  /\bsynergy\b/i,
  /\bpain points?\b/i,
  /\breaching out\b/i,
  /\breach out\b/i,
  /\btouch base\b/i,
  /\bcircle back\b/i,
  /\bfast-paced\b/i,
  /\bpassionate\b/i,
  /\bthrilled\b/i,
  /\bspearheaded\b/i,
  /\brobust\b/i,
  /\bpivotal\b/i,
  /\bshowcase\b/i,
  /\btestament\b/i,
  /\bhit the ground running\b/i,
  /\bproven track record\b/i,
  /\bdynamic team\b/i,
  /\bcutting-edge\b/i,
  /\baligns with my background\b/i,
  /\bstrong foundation\b/i,
  /\bexcited to\b/i,
  /\bhope this finds you\b/i,
  /\bhope you(?:'re| are) doing well\b/i,
  /\bcame across\b/i,
  /\bi noticed\b/i,
  /\bi stumbled upon\b/i,
  /\bi(?:'d| would) love to\b/i,
  /\bbest-in-class\b/i,
  /\bstate-of-the-art\b/i,
  /\blet me know if you have any questions\b/i,
  /\bfeel free to\b/i,
  /\bwriting to express\b/i,
  /\btailored\b/i,
  /\b(?:Full-?Stack|FullStack|DotNet|AI-Python)\s+PDF\b/i,
  /\bPDF\s+resume\b/i,
];

const COMPANY_SPLAIN_PATTERNS: readonly RegExp[] = [
  /\b(?:depends on|centers on|rely on|relies on|requires tight|takes clean)\b/i,
];

const PARENTHETICAL_DUMP_RE = /\((?:[^)]*\b(?:202\d|Aug|Sep|Jun|Dec|SDE|L2)\b[^)]*)\)/i;
const CONTRACTION_RE =
  /\b(?:I'm|I've|I'd|it's|don't|that's|here's|can't|won't|you're|we're|isn't|aren't|wasn't)\b/i;
const ABSTRACT_TRIAD_RE =
  /\b[a-z]{3,}(?:ity|ness|ment|tion|sion|ance|ence|ship)s?,\s+[a-z]{3,}(?:ity|ness|ment|tion|sion|ance|ence|ship)s?,?\s+(?:and\s+|or\s+)?[a-z]{3,}(?:ity|ness|ment|tion|sion|ance|ence|ship)s?\b/i;

const CONTRAST_FORMULAS: readonly RegExp[] = [
  /\bnot\s+(?:just|only)\b[^.!?\n]{1,65}\bbut\b/i,
  /\bless about\b[^.!?\n]{1,50}\bmore about\b/i,
];

export function countWords(text: string): number {
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return tokens.length;
}

function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n") || safe.includes("\r")) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}

export function lintOutreachDraft(
  draft: DraftEmailItem,
  repoRoot: string = REPO_ROOT,
): { errors: string[]; wordCount: number } {
  const errors: string[] = [];
  const email = draft.recipientEmail?.trim() ?? "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push(`invalid recipientEmail "${email}"`);
  } else if (isNonHiringEmail(email)) {
    errors.push(`non-hiring email blocked "${email}"`);
  }

  const attachmentAbs = resolve(repoRoot, draft.attachmentPath);
  if (!draft.attachmentPath || !existsSync(attachmentAbs)) {
    errors.push(`missing attachment PDF "${draft.attachmentPath}"`);
  }

  const subject = draft.subject.trim();
  const body = draft.body.trim();
  if (!subject) errors.push("empty subject");
  if (subject.length > 78) errors.push(`subject too long (${subject.length} > 78 chars)`);

  const wordCount = countWords(body);
  if (wordCount < 70 || wordCount > 130) {
    errors.push(`body word count ${wordCount} outside [70, 130]`);
  }

  if (!CONTRACTION_RE.test(body)) {
    errors.push("body lacks natural contractions (use I'm/I've/it's/etc.)");
  }

  const combined = `${subject}\n${body}`;
  if (/[—–]/.test(combined) || combined.includes("--")) {
    errors.push("contains banned em-dash, en-dash, or '--'");
  }
  if (combined.includes("!")) {
    errors.push("contains banned exclamation mark '!'");
  }
  if (/\*\*[^*]+\*\*/.test(body) || /<\/?[a-z][^>]*>/i.test(body)) {
    errors.push("contains markdown bold or HTML markup");
  }
  if (/^\s*[-*]\s+/m.test(body)) {
    errors.push("contains markdown bullet list lines");
  }

  const parentheticalDump = PARENTHETICAL_DUMP_RE.exec(body);
  if (parentheticalDump) {
    errors.push(`contains parenthetical date/title dump "${parentheticalDump[0]}"`);
  }

  for (const re of COMPANY_SPLAIN_PATTERNS) {
    const match = re.exec(body);
    if (match) {
      errors.push(`contains brochure/company-splain phrase "${match[0]}"`);
    }
  }

  const abstractTriad = ABSTRACT_TRIAD_RE.exec(body);
  if (abstractTriad) {
    errors.push(`contains abstract noun triad "${abstractTriad[0]}"`);
  }

  for (const re of CONTRAST_FORMULAS) {
    const match = re.exec(combined);
    if (match) {
      errors.push(`contains contrast formula "${match[0]}"`);
    }
  }

  for (const re of BANNED_AI_PHRASES) {
    const match = re.exec(combined);
    if (match) {
      errors.push(`contains banned AI phrase "${match[0]}"`);
    }
  }

  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  for (const para of paragraphs) {
    const paraWithoutUrls = para.replace(/https?:\/\/\S+/gi, "").trim();
    const sentences = paraWithoutUrls
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length > 4) {
      errors.push(`paragraph has ${sentences.length} sentences (max 4)`);
    }
    for (const sentence of sentences) {
      const sentenceWords = countWords(sentence);
      if (sentenceWords > 28) {
        errors.push(`sentence has ${sentenceWords} words (max 28): "${sentence.slice(0, 48)}..."`);
      }
    }
  }

  const overYearsMatch = /\b([3-9]|1\d)\+?\s+years\b/i.exec(body);
  if (overYearsMatch) {
    errors.push(`untruthful YOE phrasing "${overYearsMatch[0]}"`);
  }

  return { errors, wordCount };
}

function buildMarkdownSummary(drafts: DraftEmailItem[], wordCounts: Map<string, number>): string {
  const lines: string[] = [
    `# Outreach Ready Summary (${drafts.length} Direct Targets)`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Draft | Group | Rank | Company | Role | Recipient | Resume | Words |",
    "| :--- | :---: | :---: | :--- | :--- | :--- | :--- | :---: |",
  ];

  for (const d of drafts) {
    lines.push(
      `| ${d.draftId} | ${d.group} | ${d.rank} | ${d.companyName.replaceAll("|", "\\|")} | ${d.title.replaceAll("|", "\\|")} | ${d.recipientEmail} | ${d.resumeVariant} | ${wordCounts.get(d.draftId) ?? 0} |`,
    );
  }

  lines.push("", "## Full Drafts", "");
  for (const d of drafts) {
    lines.push(
      `### ${d.draftId} - ${d.companyName} (${d.title})`,
      `- **To:** ${d.recipientEmail} (${d.emailConfidence})`,
      `- **Attachment:** ${d.attachmentPath}`,
      `- **Subject:** ${d.subject}`,
      "",
      "```text",
      d.body,
      "```",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildCsv(drafts: DraftEmailItem[], wordCounts: Map<string, number>): string {
  const headers = [
    "draftId",
    "group",
    "rank",
    "companyName",
    "title",
    "recipientEmail",
    "emailConfidence",
    "resumeVariant",
    "attachmentPath",
    "wordCount",
    "subject",
    "body",
    "portfolioLinkUsed",
  ];
  const rows = [headers.join(",")];
  for (const d of drafts) {
    rows.push(
      [
        d.draftId,
        String(d.group),
        String(d.rank),
        d.companyName,
        d.title,
        d.recipientEmail,
        d.emailConfidence,
        d.resumeVariant,
        d.attachmentPath,
        String(wordCounts.get(d.draftId) ?? 0),
        d.subject,
        d.body,
        d.portfolioLinkUsed,
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

function parseCompileArgs(argv: string[]): { outreachDir: string; group: 1 | 2 | 3 | null } {
  let group: 1 | 2 | 3 | null = null;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--group") {
      const next = argv[i + 1];
      if (next !== "1" && next !== "2" && next !== "3") {
        throw new Error(`Invalid --group value "${next ?? ""}" (expected 1, 2, or 3)`);
      }
      group = Number(next) as 1 | 2 | 3;
      i += 1;
    } else if (arg.startsWith("--group=")) {
      const val = arg.slice("--group=".length);
      if (val !== "1" && val !== "2" && val !== "3") {
        throw new Error(`Invalid --group value "${val}" (expected 1, 2, or 3)`);
      }
      group = Number(val) as 1 | 2 | 3;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  return {
    outreachDir: positional[0] ? resolve(positional[0]) : DEFAULT_OUTREACH_DIR,
    group,
  };
}

function validateDraftCollection(
  drafts: DraftEmailItem[],
  expectedIds: Set<string>,
): { wordCounts: Map<string, number>; failures: string[] } {
  const seenEmails = new Set<string>();
  const seenIds = new Set<string>();
  const wordCounts = new Map<string, number>();
  const failures: string[] = [];

  for (const draft of drafts) {
    if (seenIds.has(draft.draftId)) {
      failures.push(`[${draft.draftId}] duplicate draftId`);
    }
    seenIds.add(draft.draftId);

    const emailKey = draft.recipientEmail.trim().toLowerCase();
    if (seenEmails.has(emailKey)) {
      failures.push(`[${draft.draftId}] duplicate recipientEmail "${emailKey}"`);
    }
    seenEmails.add(emailKey);

    const { errors, wordCount } = lintOutreachDraft(draft, REPO_ROOT);
    wordCounts.set(draft.draftId, wordCount);
    for (const err of errors) {
      failures.push(`[${draft.draftId}] (${draft.companyName}) ${err}`);
    }
  }

  for (const expectedId of expectedIds) {
    if (!seenIds.has(expectedId)) {
      failures.push(`[${expectedId}] missing draft from drafts-group-*.json`);
    }
  }

  return { wordCounts, failures };
}

function loadGroupTargets(outreachDir: string, g: 1 | 2 | 3): { hasInput: boolean; targetIds: string[] } {
  const inputPath = join(outreachDir, `input-group-${g}.json`);
  if (!existsSync(inputPath)) {
    return { hasInput: false, targetIds: [] };
  }
  const inputJson = JSON.parse(readFileSync(inputPath, "utf8")) as OutreachGroupFile;
  return {
    hasInput: true,
    targetIds: inputJson.targets.map((t) => t.draftId),
  };
}

function main(): void {
  const { outreachDir, group } = parseCompileArgs(process.argv.slice(2));
  const groupsToProcess: readonly (1 | 2 | 3)[] = group ? [group] : [1, 2, 3];
  const expectedIds = new Set<string>();
  const allDrafts: DraftEmailItem[] = [];

  for (const g of groupsToProcess) {
    const { hasInput, targetIds } = loadGroupTargets(outreachDir, g);
    for (const id of targetIds) {
      expectedIds.add(id);
    }

    if (!group && hasInput && targetIds.length === 0) {
      continue;
    }

    const draftPath = join(outreachDir, `drafts-group-${g}.json`);
    if (!existsSync(draftPath)) {
      throw new Error(`Missing draft file: ${draftPath}`);
    }
    const parsed = JSON.parse(readFileSync(draftPath, "utf8")) as DraftGroupOutput;
    allDrafts.push(...parsed.drafts);
  }

  allDrafts.sort((a, b) => a.rank - b.rank || a.draftId.localeCompare(b.draftId));
  const { wordCounts, failures } = validateDraftCollection(allDrafts, expectedIds);

  if (failures.length > 0) {
    const label = group ? `Group ${group}` : "compile";
    console.error(`[compile-and-lint] ${label} FAILED with ${failures.length} error(s):`);
    for (const line of failures) {
      console.error(`  - ${line}`);
    }
    process.exit(1);
  }

  if (group) {
    console.log(`[compile-and-lint] Group ${group} PASSED (${allDrafts.length}/${expectedIds.size} drafts).`);
    return;
  }

  const variantCounts: Record<ResumeVariant, number> = {
    DotNet: 0,
    FullStack: 0,
    "AI-Python": 0,
  };
  for (const d of allDrafts) {
    variantCounts[d.resumeVariant] = (variantCounts[d.resumeVariant] ?? 0) + 1;
  }

  const compiled: CompiledOutreachPayload = {
    generatedAt: new Date().toISOString(),
    totalDrafts: allDrafts.length,
    variantCounts,
    drafts: allDrafts,
  };

  writeFileSync(join(outreachDir, "outreach-ready.json"), `${JSON.stringify(compiled, null, 2)}\n`, "utf8");
  writeFileSync(join(outreachDir, "outreach-ready.md"), buildMarkdownSummary(allDrafts, wordCounts), "utf8");
  writeFileSync(join(outreachDir, "outreach-ready.csv"), buildCsv(allDrafts, wordCounts), "utf8");

  console.log(
    `[compile-and-lint] PASSED ${allDrafts.length}/${expectedIds.size} drafts (DotNet=${variantCounts.DotNet}, FullStack=${variantCounts.FullStack}, AI-Python=${variantCounts["AI-Python"]}).`,
  );
  console.log(`[compile-and-lint] Wrote outreach-ready.{json,md,csv} in ${outreachDir}`);
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isEntrypoint) {
  main();
}
