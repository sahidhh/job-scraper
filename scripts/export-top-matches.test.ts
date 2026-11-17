import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseExportArgs } from "./export-top-matches";
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
  type ExportedJobMatch,
  type ExportPayload,
} from "./lib/exportTopMatchesFormat";

function makeMatch(overrides: Partial<ExportedJobMatch> = {}): ExportedJobMatch {
  return {
    rank: 1,
    id: "job-1",
    origin: "scraper",
    source: "greenhouse",
    companyName: "Acme Corp",
    canonicalCompanyName: "acme",
    title: "Backend .NET Engineer",
    effectiveScore: 0.85,
    overallScore: 0.85,
    aiScore: 0.82,
    keywordScore: 0.65,
    manualScore: null,
    scoreBand: "strong",
    overallScoreReasons: ["preferred company"],
    aiReasoning: "Strong C# and PostgreSQL overlap.",
    manualStandout: null,
    manualVerify: null,
    manualRequirements: null,
    locationRaw: "Remote - India",
    locationTags: ["india", "remote"],
    workArrangement: null,
    seniority: "mid",
    minYears: 2,
    employmentType: "full_time",
    salarySummary: "INR 1,200,000 - 1,800,000 / yearly (high)",
    visaSponsorship: null,
    relocationAssistance: null,
    urgentHiring: false,
    statusLabel: "New",
    postedAt: "2026-11-15T10:00:00Z",
    firstSeenAt: "2026-11-15T12:00:00Z",
    url: "https://boards.greenhouse.io/acme/jobs/1",
    careerPageUrl: "https://acme.example/careers",
    websiteUrl: "https://acme.example",
    contactEmail: "talent@acme.example",
    contactEmailCategory: "recruiter",
    contactEmailConfidence: "high",
    allExtractedEmails: ["talent@acme.example"],
    outreachPath: "direct_email",
    matchedSkills: ["C#", ".NET", "PostgreSQL"],
    missingSkills: ["Kubernetes"],
    recommendedResumeHooks: [
      "Propel .NET 8 CQRS + Clean Architecture migration (MediatR, EF Core, Unit of Work): cut new feature delivery from ~2 weeks to 4 days",
    ],
    existingDrafts: [],
    description: "Looking for C#, .NET 8, PostgreSQL, and Kubernetes experience.\nReach out to talent@acme.example.",
    ...overrides,
  };
}

describe("parseExportArgs", () => {
  it("parses default options", () => {
    expect(parseExportArgs([])).toEqual({
      limit: 50,
      outDir: "reports/top-matches",
      locationTags: undefined,
      remoteOnly: undefined,
      origin: "all",
    });
  });

  it("parses custom limit, location, remote, origin, and out-dir", () => {
    expect(parseExportArgs(["25", "--location", "uae", "--remote", "--origin", "claude_routine", "--out-dir", "tmp/out"])).toEqual({
      limit: 25,
      outDir: "tmp/out",
      locationTags: ["uae"],
      remoteOnly: true,
      origin: "claude_routine",
    });
  });
});

describe("scoring and ranking helpers", () => {
  it("computes effective score for scraper vs claude_routine", () => {
    expect(
      computeEffectiveScore({ origin: "scraper", overallScore: 0.82, aiScore: 0.8, manualScore: null }),
    ).toBe(0.82);
    expect(
      computeEffectiveScore({ origin: "claude_routine", overallScore: null, aiScore: null, manualScore: 84 }),
    ).toBe(0.84);
  });

  it("classifies score bands correctly around shrug and strong boundaries", () => {
    expect(classifyScoreBand(0.75)).toBe("strong");
    expect(classifyScoreBand(0.45)).toBe("moderate");
    expect(classifyScoreBand(0.4)).toBe("shrug");
    expect(classifyScoreBand(null)).toBe("unscored");
  });

  it("sorts strong > moderate > shrug > unscored and breaks ties by keywordScore and postedAt", () => {
    const items = [
      { id: "shrug", origin: "scraper" as const, overallScore: 0.4, aiScore: 0.4, keywordScore: 0.9, manualScore: null, postedAt: "2026-11-16T00:00:00Z" },
      { id: "unscored", origin: "scraper" as const, overallScore: null, aiScore: null, keywordScore: 0.8, manualScore: null, postedAt: "2026-11-17T00:00:00Z" },
      { id: "manual", origin: "claude_routine" as const, overallScore: null, aiScore: null, keywordScore: null, manualScore: 88, postedAt: "2026-11-10T00:00:00Z" },
      { id: "mod", origin: "scraper" as const, overallScore: 0.6, aiScore: 0.6, keywordScore: 0.5, manualScore: null, postedAt: "2026-11-16T00:00:00Z" },
    ];
    const sorted = [...items].sort(compareMatchCandidates).map((x) => x.id);
    expect(sorted).toEqual(["manual", "mod", "shrug", "unscored"]);
  });
});

describe("skill diff, email extraction, and resume hooks", () => {
  it("diffs matched and missing skills using dictionary", () => {
    const { matchedSkills, missingSkills } = deriveSkillDiff(
      "Requires C#, .NET 8, PostgreSQL, Angular, and Kafka experience.",
      ["C#", ".NET", "PostgreSQL"],
    );
    expect(matchedSkills).toEqual(["C#", ".NET", "PostgreSQL"]);
    expect(missingSkills).toEqual(["Angular", "Kafka"]);
  });

  it("extracts unique non-automated emails while filtering noreply", () => {
    const emails = extractAllContactEmails(
      "Send CV to noreply@acme.com, hr@acme.com, or CTO@acme.com (cc hr@acme.com).",
      "jobs@acme.com",
    );
    expect(emails).toEqual(["jobs@acme.com", "hr@acme.com", "CTO@acme.com"]);
  });

  it("determines outreach path in priority order", () => {
    expect(determineOutreachPath("a@b.com", [], null)).toBe("direct_email");
    expect(determineOutreachPath(null, [], "https://acme.com/careers")).toBe("career_page");
    expect(determineOutreachPath(null, [], null)).toBe("ats_board");
  });

  it("derives relevant resume proof points and formats salary", () => {
    const hooks = deriveResumeHooks("Build .NET 8 microservices with PostgreSQL and Python LLM agents.", ["C#", ".NET"]);
    expect(hooks.length).toBeGreaterThanOrEqual(2);
    expect(hooks.some((h) => h.includes("CQRS"))).toBe(true);
    expect(hooks.some((h) => h.includes("PostgreSQL"))).toBe(true);
    expect(
      formatSalarySummary({
        salaryCurrency: "SGD",
        salaryMin: 7000,
        salaryMax: 9000,
        salaryPeriod: "monthly",
        salaryConfidence: "high",
      }),
    ).toBe("SGD 7,000 - 9,000 / monthly (high)");
  });
});

describe("CSV, XLSX, and Markdown export formatters", () => {
  it("produces UTF-8 BOM CSV and escapes commas/quotes/newlines", () => {
    const match = makeMatch({
      title: 'Engineer, "Backend" Lead',
      description: 'Line 1, with comma\nLine 2 "quoted"',
    });
    const csv = toCsvWithBom([match]);
    expect(csv.startsWith("\uFEFFrank,score_pct")).toBe(true);
    expect(csv).toContain('"Engineer, ""Backend"" Lead"');
    expect(csv).toContain('"Line 1, with comma\nLine 2 ""quoted"""');
  });

  it("builds a valid OpenXML .xlsx workbook with both sheets", async () => {
    const buf = await toXlsxBuffer([makeMatch({ description: "Clean <xml> & control\u0001char" })]);
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
    expect(zip.file("xl/workbook.xml")).not.toBeNull();
    expect(zip.file("xl/worksheets/sheet1.xml")).not.toBeNull();
    expect(zip.file("xl/worksheets/sheet2.xml")).not.toBeNull();

    const sheet1Xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet1Xml).toContain("Acme Corp");
    expect(sheet1Xml).toContain("Clean &lt;xml&gt; &amp; controlchar");
    expect(sheet1Xml).not.toContain("\u0001");
  });

  it("builds markdown summary with counts and table", () => {
    const payload: ExportPayload = {
      generatedAt: "2026-11-17T00:00:00Z",
      roleSelection: { id: "r1", primaryRole: "Full Stack Developer", expandedRoles: ["Backend Engineer"] },
      resume: { id: "res1", version: 3, skills: ["C#", ".NET", "PostgreSQL"] },
      totalCandidatesEvaluated: 120,
      exportedCount: 1,
      matches: [makeMatch()],
    };
    const md = toMarkdownSummary(payload);
    expect(md).toContain("# Top 1 Job Matches");
    expect(md).toContain("Acme Corp");
    expect(md).toContain("talent@acme.example");
  });
});
