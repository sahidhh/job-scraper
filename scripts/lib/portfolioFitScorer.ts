import { containsToken } from "@/shared/domain/skills";

export type ResumeVariant = "DotNet" | "FullStack" | "AI-Python";

export interface PortfolioFitInput {
  title: string;
  description: string;
  locationRaw: string;
  locationTags: readonly string[];
  minYears: number | null;
  visaSponsorship: boolean | null;
  hasDirectEmail: boolean;
  aiScore: number | null;
  keywordScore: number | null;
  manualScore: number | null;
}

export interface PortfolioFitResult {
  portfolioFitScore: number;
  portfolioFitBreakdown: string;
  recommendedResumeVariant: ResumeVariant;
  recommendedPortfolioLinks: string[];
}

interface WeightedToken {
  tokens: readonly string[];
  points: number;
}

const DOTNET_SIGNALS: readonly WeightedToken[] = [
  { tokens: ["c#", "csharp"], points: 8 },
  { tokens: [".net", "dotnet", "asp.net", ".net core", ".net 8"], points: 8 },
  { tokens: ["entity framework", "ef core"], points: 5 },
  { tokens: ["cqrs", "mediatr", "clean architecture"], points: 5 },
  { tokens: ["postgresql", "postgres", "sql server"], points: 5 },
  { tokens: ["sql"], points: 3 },
  { tokens: ["azure"], points: 4 },
  { tokens: ["microservices", "microservice"], points: 4 },
  { tokens: ["rest", "restful", "rest api"], points: 3 },
];

const FULLSTACK_SIGNALS: readonly WeightedToken[] = [
  { tokens: ["typescript", "ts"], points: 7 },
  { tokens: ["javascript", "js"], points: 5 },
  { tokens: ["angular", "angularjs"], points: 7 },
  { tokens: ["react", "react.js", "reactjs"], points: 6 },
  { tokens: ["next.js", "nextjs"], points: 5 },
  { tokens: ["node", "node.js", "nodejs"], points: 5 },
  { tokens: ["redux"], points: 3 },
  { tokens: ["supabase", "cloudflare"], points: 4 },
  { tokens: ["html", "html5", "css", "tailwind", "tailwindcss"], points: 2 },
];

const AI_PYTHON_SIGNALS: readonly WeightedToken[] = [
  { tokens: ["python"], points: 7 },
  { tokens: ["fastapi"], points: 5 },
  { tokens: ["llm", "genai", "openai", "claude", "agentic", "ai agent", "prompt engineering", "rag"], points: 6 },
  { tokens: ["pdf", "ocr", "pymupdf", "document processing", "document extraction"], points: 4 },
  { tokens: ["docker", "ci/cd", "github actions", "jenkins", "aws"], points: 3 },
];

const OFF_STACK_TITLE_TOKENS: readonly string[] = [
  "golang",
  "rust",
  "ruby",
  "rails",
  "php",
  "laravel",
  "c++",
  "cpp",
  "embedded",
  "firmware",
  "robotics",
  "ios",
  "swift",
  "flutter",
  "salesforce",
  "sap",
  "vue",
  "vue.js",
  "vuejs",
  "java",
];

const PORTFOLIO_CORE_TITLE_TOKENS: readonly string[] = [
  "c#",
  ".net",
  "asp.net",
  "full stack",
  "fullstack",
  "full-stack",
  "backend",
  "back-end",
  "software engineer",
  "software developer",
  "angular",
  "react",
  "typescript",
  "python",
];

const SENIOR_BLOCKER_TITLE_TOKENS: readonly string[] = [
  "staff",
  "principal",
  "director",
  "vp",
  "head of",
  "engineering manager",
  "architect",
];

const PORTFOLIO_BASE = "https://sahidhh.github.io/portfolio";

function sumTrackScore(text: string, signals: readonly WeightedToken[]): number {
  let total = 0;
  for (const sig of signals) {
    if (sig.tokens.some((tok) => containsToken(text, tok))) {
      total += sig.points;
    }
  }
  return total;
}

function hasTitleCoreMatch(titleLower: string): boolean {
  return PORTFOLIO_CORE_TITLE_TOKENS.some((tok) => containsToken(titleLower, tok));
}

function hasOffStackTitleMismatch(titleLower: string): boolean {
  // Handle "go" carefully so "go-to-market" or common words don't falsely trigger,
  // using explicit language phrases alongside OFF_STACK_TITLE_TOKENS.
  const hasExplicitGo = /\b(go programming|golang|\bgo\b\s+(developer|engineer|backend))\b/i.test(titleLower);
  if (hasExplicitGo) return true;

  const offStackHit = OFF_STACK_TITLE_TOKENS.some((tok) => containsToken(titleLower, tok));
  if (!offStackHit) return false;

  // Don't penalize if title also explicitly asks for .NET, C#, React, Angular, or Python.
  const hasPortfolioPrimary = ["c#", ".net", "asp.net", "angular", "react", "python", "typescript"].some((tok) =>
    containsToken(titleLower, tok),
  );
  return !hasPortfolioPrimary;
}

function scoreExperienceFit(titleLower: string, minYears: number | null): { points: number; penalty: number; note: string } {
  const isStaffOrHigher =
    SENIOR_BLOCKER_TITLE_TOKENS.some((tok) => containsToken(titleLower, tok)) ||
    /\bmanager\b/i.test(titleLower);

  if (isStaffOrHigher) {
    return { points: 0, penalty: 12, note: "Staff/Mgr/Architect" };
  }

  if (minYears !== null) {
    if (minYears <= 3) return { points: 25, penalty: 0, note: `${minYears}y` };
    if (minYears === 4) return { points: 16, penalty: 0, note: "4y" };
    if (minYears === 5) return { points: 8, penalty: 0, note: "5y" };
    return { points: 0, penalty: 6, note: `${minYears}+y` };
  }

  if (/\b(senior|sr\.?|lead)\b/i.test(titleLower)) {
    return { points: 12, penalty: 0, note: "Senior title" };
  }

  return { points: 25, penalty: 0, note: "Mid/SE fit" };
}

function scoreLocationFit(
  locationRaw: string,
  locationTags: readonly string[],
  visaSponsorship: boolean | null,
  hasDirectEmail: boolean,
): { points: number; note: string } {
  const isRemote = locationTags.includes("remote");
  const isIndia = locationTags.includes("india");
  const lowerLoc = locationRaw.toLowerCase();

  if (isIndia && isRemote) {
    return { points: 15, note: "Remote India" };
  }
  if (isIndia) {
    const isHub = /\b(chennai|bengaluru|bangalore)\b/i.test(lowerLoc);
    return { points: isHub ? 15 : 13, note: isHub ? "Chennai/Blr" : "India" };
  }
  if (isRemote) {
    return { points: 14, note: "Remote" };
  }
  if (visaSponsorship === true || hasDirectEmail) {
    return { points: 12, note: visaSponsorship === true ? "Sponsoring" : "Direct contact" };
  }
  if (locationTags.includes("singapore") || locationTags.includes("uae")) {
    return { points: 5, note: "SG/UAE onsite" };
  }
  return { points: 4, note: "Other loc" };
}

function scoreExistingSignal(
  aiScore: number | null,
  keywordScore: number | null,
  manualScore: number | null,
): number {
  const judged = aiScore ?? (manualScore !== null ? manualScore / 100 : null);
  const kw = keywordScore ?? 0;

  if (judged !== null) {
    return Math.round(Math.min(15, (0.65 * judged + 0.35 * kw) * 15));
  }
  return Math.round(Math.min(15, Math.min(1, kw * 1.25) * 15));
}

function selectPortfolioLinks(combinedText: string, variant: ResumeVariant): string[] {
  const links: string[] = [];
  const lower = combinedText.toLowerCase();

  if (/\b(pdf|ocr|document|pymupdf|python|fastapi|azure)\b/i.test(lower)) {
    links.push(`${PORTFOLIO_BASE}/projects/pdf-diff.html`);
  }
  if (/\b(ai|llm|agent|claude|openai|genai|automation|scraper)\b/i.test(lower)) {
    links.push(`${PORTFOLIO_BASE}/projects/pi-agentic.html`);
  }
  if (/\b(next\.js|nextjs|supabase|pipeline|typescript|postgres|postgresql|node)\b/i.test(lower)) {
    links.push(`${PORTFOLIO_BASE}/projects/job-pipeline.html`);
  }
  if (/\b(react|redux|frontend|ui|angular|crm|indexeddb)\b/i.test(lower)) {
    links.push(`${PORTFOLIO_BASE}/projects/freelance-radar.html`);
  }
  if (/\b(router|routing|classifier|keyword|cli)\b/i.test(lower)) {
    links.push(`${PORTFOLIO_BASE}/projects/profile-router.html`);
  }

  if (links.length === 0) {
    if (variant === "DotNet") {
      links.push(`${PORTFOLIO_BASE}/projects/pdf-diff.html`, `${PORTFOLIO_BASE}/projects/job-pipeline.html`);
    } else if (variant === "AI-Python") {
      links.push(`${PORTFOLIO_BASE}/projects/pi-agentic.html`, `${PORTFOLIO_BASE}/projects/pdf-diff.html`);
    } else {
      links.push(`${PORTFOLIO_BASE}/projects/job-pipeline.html`, `${PORTFOLIO_BASE}/projects/freelance-radar.html`);
    }
  }

  return [...new Set(links)].slice(0, 3);
}

export function computePortfolioFitScore(input: PortfolioFitInput): PortfolioFitResult {
  const titleLower = input.title.toLowerCase();
  const combined = `${input.title}\n${input.description}`;

  const dotnetRaw = sumTrackScore(combined, DOTNET_SIGNALS);
  const fullstackRaw = sumTrackScore(combined, FULLSTACK_SIGNALS);
  const aiPythonRaw = sumTrackScore(combined, AI_PYTHON_SIGNALS);

  const titleDotnet = sumTrackScore(input.title, DOTNET_SIGNALS);
  const titleFullstack = sumTrackScore(input.title, FULLSTACK_SIGNALS);
  const titleAiPython = sumTrackScore(input.title, AI_PYTHON_SIGNALS);

  // Rank track preference with title boost, breaking ties DotNet > FullStack > AI-Python.
  const dotnetTotal = dotnetRaw + titleDotnet;
  const fullstackTotal = fullstackRaw + titleFullstack;
  const aiPythonTotal = aiPythonRaw + titleAiPython;

  let recommendedResumeVariant: ResumeVariant = "DotNet";
  if (fullstackTotal > dotnetTotal && fullstackTotal >= aiPythonTotal) {
    recommendedResumeVariant = "FullStack";
  } else if (aiPythonTotal > dotnetTotal && aiPythonTotal > fullstackTotal) {
    recommendedResumeVariant = "AI-Python";
  }

  const primaryTrack = Math.max(dotnetRaw, fullstackRaw, aiPythonRaw);
  const secondaryTrack = [dotnetRaw, fullstackRaw, aiPythonRaw].sort((a, b) => b - a)[1] ?? 0;

  let stackPoints = Math.min(34, Math.round(primaryTrack * 1.15 + secondaryTrack * 0.45));
  if (hasTitleCoreMatch(titleLower)) {
    stackPoints += 5;
  }
  const activeTrackCount = [dotnetRaw, fullstackRaw, aiPythonRaw].filter((v) => v >= 10).length;
  if (activeTrackCount >= 2) {
    stackPoints += 6;
  }
  if (hasOffStackTitleMismatch(titleLower)) {
    stackPoints = Math.max(0, stackPoints - 15);
  }
  stackPoints = Math.min(45, stackPoints);

  const exp = scoreExperienceFit(titleLower, input.minYears);
  const loc = scoreLocationFit(
    input.locationRaw,
    input.locationTags,
    input.visaSponsorship,
    input.hasDirectEmail,
  );
  const signalPoints = scoreExistingSignal(input.aiScore, input.keywordScore, input.manualScore);

  const rawTotal = stackPoints + exp.points + loc.points + signalPoints - exp.penalty;
  const portfolioFitScore = Math.max(0, Math.min(100, rawTotal));

  const portfolioFitBreakdown =
    `Stack ${stackPoints}/45 (${recommendedResumeVariant}) · ` +
    `YOE ${exp.points}/25 (${exp.note}) · ` +
    `Loc ${loc.points}/15 (${loc.note}) · ` +
    `Signal ${signalPoints}/15`;

  return {
    portfolioFitScore,
    portfolioFitBreakdown,
    recommendedResumeVariant,
    recommendedPortfolioLinks: selectPortfolioLinks(combined, recommendedResumeVariant),
  };
}
