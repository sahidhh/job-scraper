import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { enrichMatchesWithContacts, loadDefaultVerifiedContacts } from "./enrich-export-contacts";
import { parseExportArgs } from "./export-top-matches";
import {
  classifyScoreBand,
  compareMatchCandidates,
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
  type ExportedJobMatch,
  type ExportPayload,
} from "./lib/exportTopMatchesFormat";
import {
  extractAdzunaFullDescription,
  isExplicitlyClosedHtml,
  probeAndEnrichJobs,
} from "./lib/jobLivenessAndEnrich";
import { computePortfolioFitScore } from "./lib/portfolioFitScorer";
import type { Database } from "../supabase/database.types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

function makeMatch(overrides: Partial<ExportedJobMatch> = {}): ExportedJobMatch {
  return {
    rank: 1,
    id: "job-1",
    origin: "scraper",
    source: "greenhouse",
    companyName: "Acme Corp",
    canonicalCompanyName: "acme",
    title: "Backend .NET Engineer",
    portfolioFitScore: 86,
    portfolioFitBreakdown: "Stack 38/45 (DotNet) · YOE 25/25 (2y) · Loc 15/15 (Remote India) · Signal 11/15",
    recommendedResumeVariant: "DotNet",
    recommendedPortfolioLinks: ["https://sahidhh.github.io/portfolio/projects/pdf-diff.html"],
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

function makeJobRow(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "job-row-1",
    source: "mycareersfuture",
    source_job_id: "mcf-uuid-1",
    company_id: null,
    company_name: "",
    canonical_company_name: "",
    title: "Full Stack Developer",
    location_raw: "Singapore",
    location_tags: ["singapore"],
    description: "Short description",
    url: "https://www.mycareersfuture.gov.sg/job/mcf-uuid-1",
    posted_at: "2026-11-10T00:00:00Z",
    first_seen_at: "2026-11-10T00:00:00Z",
    last_seen_at: "2026-11-17T00:00:00Z",
    updated_at: "2026-11-17T00:00:00Z",
    min_years: 2,
    is_active: true,
    inactive_reason: null,
    fingerprint: "fp-1",
    contact_email: null,
    contact_email_category: null,
    contact_email_confidence: null,
    salary_currency: null,
    salary_min: null,
    salary_max: null,
    salary_period: null,
    salary_confidence: null,
    employment_type: null,
    seniority: null,
    work_arrangement: null,
    visa_sponsorship: null,
    relocation_assistance: null,
    security_clearance: false,
    urgent_hiring: false,
    ineligible_reason: null,
    manual_score: null,
    manual_standout: null,
    manual_verify: null,
    manual_requirements: null,
    ...overrides,
  };
}

describe("parseExportArgs", () => {
  it("parses default options", () => {
    expect(parseExportArgs([])).toEqual({
      limit: 500,
      outDir: "reports/top-matches",
      locationTags: undefined,
      remoteOnly: undefined,
      origin: "all",
      skipProbe: false,
    });
  });

  it("parses custom limit, location, remote, origin, skip-probe, and out-dir", () => {
    expect(
      parseExportArgs(["25", "--location", "uae", "--remote", "--origin", "claude_routine", "--skip-probe", "--out-dir", "tmp/out"]),
    ).toEqual({
      limit: 25,
      outDir: "tmp/out",
      locationTags: ["uae"],
      remoteOnly: true,
      origin: "claude_routine",
      skipProbe: true,
    });
  });
});

describe("portfolioFitScorer", () => {
  it("ranks .NET + PostgreSQL + Angular 2 YOE India/Remote role high and selects DotNet variant", () => {
    const fit = computePortfolioFitScore({
      title: "Full Stack Software Engineer (.NET / Angular)",
      description:
        "Build C# .NET 8 ASP.NET Core Web APIs with EF Core, CQRS, MediatR, PostgreSQL, Azure Blob Storage, and Angular TypeScript UI.",
      locationRaw: "Chennai, India (Remote)",
      locationTags: ["india", "remote"],
      minYears: 2,
      visaSponsorship: null,
      hasDirectEmail: false,
      aiScore: null,
      keywordScore: 0.65,
      manualScore: null,
    });

    expect(fit.portfolioFitScore).toBeGreaterThanOrEqual(85);
    expect(fit.recommendedResumeVariant).toBe("DotNet");
    expect(fit.recommendedPortfolioLinks.length).toBeGreaterThan(0);
  });

  it("penalizes off-stack Staff Go/Rust/C++ roles below direct 2 YOE stack fits", () => {
    const goodFit = computePortfolioFitScore({
      title: "Full Stack Engineer (React / TypeScript / Node.js)",
      description: "React, TypeScript, Next.js, Node.js, PostgreSQL, Docker, REST APIs.",
      locationRaw: "Bengaluru, India",
      locationTags: ["india"],
      minYears: 2,
      visaSponsorship: null,
      hasDirectEmail: true,
      aiScore: null,
      keywordScore: 0.55,
      manualScore: null,
    });

    const offStackStaff = computePortfolioFitScore({
      title: "Staff Backend Engineer (Golang / Distributed Systems)",
      description: "8+ years Go, Kubernetes, Terraform, distributed storage.",
      locationRaw: "Singapore",
      locationTags: ["singapore"],
      minYears: 8,
      visaSponsorship: null,
      hasDirectEmail: false,
      aiScore: 0.35,
      keywordScore: 0.3,
      manualScore: null,
    });

    expect(goodFit.recommendedResumeVariant).toBe("FullStack");
    expect(goodFit.portfolioFitScore).toBeGreaterThan(offStackStaff.portfolioFitScore + 30);
  });

  it("selects AI-Python variant for Python FastAPI LLM roles", () => {
    const fit = computePortfolioFitScore({
      title: "Backend Python / LLM Engineer",
      description: "Python, FastAPI, LLM document extraction, PDF OCR pipelines, Docker, GitHub Actions.",
      locationRaw: "Remote",
      locationTags: ["remote"],
      minYears: 2,
      visaSponsorship: null,
      hasDirectEmail: false,
      aiScore: null,
      keywordScore: 0.5,
      manualScore: null,
    });

    expect(fit.recommendedResumeVariant).toBe("AI-Python");
    expect(fit.recommendedPortfolioLinks).toContain("https://sahidhh.github.io/portfolio/projects/pdf-diff.html");
  });
});

describe("jobLivenessAndEnrich", () => {
  it("detects closed HTML pages without triggering on script bundle 404 strings", () => {
    const liveHtmlWithScript = `<html><head><title>Stripe Careers | Engineer</title><script>var err="404";</script></head><body><p>Apply now to join our backend team.</p></body></html>`;
    const closedHtml = `<html><head><title>Software Engineer - Closed</title></head><body><div>This job is no longer accepting applications.</div></body></html>`;

    expect(isExplicitlyClosedHtml(liveHtmlWithScript)).toBeNull();
    expect(isExplicitlyClosedHtml(closedHtml)).toBe("closed_page_banner");
  });

  it("extracts full Adzuna description from adp-body section", () => {
    const html = `<section class="adp-body"><p>Build .NET 8 and React apps.</p><ul><li>PostgreSQL</li></ul></section>`;
    expect(extractAdzunaFullDescription(html)).toBe("Build .NET 8 and React apps.\nPostgreSQL");
  });

  it("probes MCF closed vs live jobs, enriches company/url/description, and checks ATS board live IDs", async () => {
    const mcfClosed = makeJobRow({ id: "mcf-1", source: "mycareersfuture", source_job_id: "uuid-closed" });
    const mcfLive = makeJobRow({ id: "mcf-2", source: "mycareersfuture", source_job_id: "uuid-live" });
    const ghClosed = makeJobRow({
      id: "gh-1",
      source: "greenhouse",
      source_job_id: "999",
      company_id: "co-1",
      company_name: "Okta",
      url: "https://okta.com/999",
    });
    const ghLive = makeJobRow({
      id: "gh-2",
      source: "greenhouse",
      source_job_id: "111",
      company_id: "co-1",
      company_name: "Okta",
      url: "https://okta.com/111",
    });

    const mockFetch: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("boards-api.greenhouse.io/v1/boards/okta/jobs")) {
        return new Response(JSON.stringify({ jobs: [{ id: 111 }] }), { status: 200 });
      }
      if (url.includes("uuid-closed")) {
        return new Response(JSON.stringify({ status: { jobStatus: "Closed" }, metadata: { expiryDate: "2026-08-01" } }), {
          status: 200,
        });
      }
      if (url.includes("uuid-live")) {
        return new Response(
          JSON.stringify({
            status: { jobStatus: "Open" },
            metadata: { expiryDate: "2027-01-15" },
            postedCompany: { name: "LIVE CO PTE LTD", companyUrl: "www.liveco.sg" },
            description: "<p>Full description with contact hr@liveco.sg</p>",
          }),
          { status: 200 },
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const { outcomes, stats } = await probeAndEnrichJobs(
      [mcfClosed, mcfLive, ghClosed, ghLive],
      [{ id: "co-1", source: "greenhouse", board_token: "okta", active: true }],
      mockFetch,
    );

    expect(stats.liveCount).toBe(2);
    expect(stats.closedCount).toBe(2);
    expect(outcomes.get("mcf-1")?.isLive).toBe(false);
    expect(outcomes.get("gh-1")?.isLive).toBe(false);
    expect(outcomes.get("gh-1")?.closedReason).toBe("not_on_ats_board");
    expect(outcomes.get("gh-2")?.isLive).toBe(true);
    expect(outcomes.get("mcf-2")?.isLive).toBe(true);
    expect(outcomes.get("mcf-2")?.enrichedCompanyName).toBe("LIVE CO PTE LTD");
    expect(outcomes.get("mcf-2")?.enrichedWebsiteUrl).toBe("https://www.liveco.sg");
    expect(outcomes.get("mcf-2")?.discoveredEmails).toContain("hr@liveco.sg");
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

  it("sorts matches best-to-worst by portfolioFitScore first, then effectiveScore", () => {
    const lowFit = makeMatch({ id: "low", portfolioFitScore: 42, effectiveScore: 0.8 });
    const highFit = makeMatch({ id: "high", portfolioFitScore: 91, effectiveScore: null });
    const midFit = makeMatch({ id: "mid", portfolioFitScore: 74, effectiveScore: 0.7 });

    const sorted = [lowFit, midFit, highFit].sort(comparePortfolioMatches).map((m) => m.id);
    expect(sorted).toEqual(["high", "mid", "low"]);
  });

  it("sorts DB candidates by effectiveScore > keywordScore > postedAt", () => {
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
    expect(csv.startsWith("\uFEFFrank,portfolio_fit_score")).toBe(true);
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

  it("builds markdown summary with counts and portfolio fit columns", () => {
    const payload: ExportPayload = {
      generatedAt: "2026-11-17T00:00:00Z",
      roleSelection: { id: "r1", primaryRole: "Full Stack Developer", expandedRoles: ["Backend Engineer"] },
      resume: { id: "res1", version: 3, skills: ["C#", ".NET", "PostgreSQL"] },
      liveness: { totalProbed: 10, liveCount: 6, closedPrunedCount: 4, dbEnrichedCount: 2 },
      totalCandidatesEvaluated: 120,
      exportedCount: 1,
      matches: [makeMatch()],
    };
    const md = toMarkdownSummary(payload);
    expect(md).toContain("# Top 1 Live Job Matches (Portfolio-Ranked)");
    expect(md).toContain("86/100");
    expect(md).toContain("DotNet");
    expect(md).toContain("Acme Corp");
    expect(md).toContain("talent@acme.example");
  });
});

describe("enrichMatchesWithContacts", () => {
  it("loads default verified contacts and enriches matching companies without leaking job-board complaints emails", () => {
    const defaults = loadDefaultVerifiedContacts();
    expect(defaults.length).toBeGreaterThan(25);

    const trexo = makeMatch({
      id: "t1",
      companyName: "Trexo Fintech Private Limited",
      title: "Full Stack Developer",
      websiteUrl: null,
      careerPageUrl: null,
      contactEmail: "complaints@internshala.com",
      allExtractedEmails: ["complaints@internshala.com"],
    });
    const jobletMicro1 = makeMatch({
      id: "m1",
      companyName: "Joblet-AI",
      title: "Remote Fullstack Engineer",
      locationRaw: "United Arab Emirates",
      locationTags: ["uae", "remote"],
      websiteUrl: null,
      careerPageUrl: null,
      description: "Short stub",
      contactEmail: null,
      allExtractedEmails: [],
    });

    const [enrichedTrexo, enrichedMicro1] = enrichMatchesWithContacts(
      [trexo, jobletMicro1],
      ["Python", "TypeScript", "React", "PostgreSQL"],
      defaults,
    );

    expect(enrichedTrexo?.allExtractedEmails).toEqual(["khushal@trexo.money"]);
    expect(enrichedTrexo?.websiteUrl).toBe("https://trexo.money/");
    expect(enrichedMicro1?.url).toBe("https://jobs.micro1.ai/post/912dac5d-2d0b-4c32-a67b-89404bcf195b");
    expect(enrichedMicro1?.description).toContain("FastAPI");
    expect(enrichedMicro1?.allExtractedEmails).toContain("support@micro1.ai");
  });
});
