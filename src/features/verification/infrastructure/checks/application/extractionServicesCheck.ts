import { extractSalary } from "@/features/jobs/domain/extractSalary";
import { extractContactEmail } from "@/features/jobs/domain/extractContactEmail";
import { extractJobAttributes } from "@/features/jobs/domain/extractJobAttributes";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

// A single fixed sample exercising all three deterministic extractors
// (extractSalary/extractContactEmail/extractJobAttributes) at once -- pure
// functions, no I/O, so this doubles as a fast regression smoke-test.
export const EXTRACTION_SAMPLE_TEXT =
  "Senior Backend Engineer (Contract, Remote) - Urgent hiring! Salary: $90,000 - $120,000 per year. " +
  "Visa sponsorship available. Contact hr@example.com for questions.";

export function evaluateExtractionServices(text: string): CheckOutcome {
  const problems: string[] = [];

  const salary = extractSalary(text);
  if (!salary || salary.currency !== "USD" || salary.min !== 90000 || salary.max !== 120000) {
    problems.push(`extractSalary: expected USD 90000-120000, got ${JSON.stringify(salary)}`);
  }

  const email = extractContactEmail(text);
  if (!email || email.email !== "hr@example.com" || email.category !== "hr") {
    problems.push(`extractContactEmail: expected hr@example.com/hr, got ${JSON.stringify(email)}`);
  }

  const attributes = extractJobAttributes(text);
  if (attributes.employmentType !== "contract" || !attributes.urgentHiring || attributes.visaSponsorship !== true) {
    problems.push(`extractJobAttributes: expected contract/urgent/visa=true, got ${JSON.stringify(attributes)}`);
  }

  if (problems.length > 0) {
    return {
      status: "fail",
      summary: "One or more deterministic extractors returned unexpected output for a known sample",
      details: problems,
      probableCause: "A recent change to extractSalary.ts/extractContactEmail.ts/extractJobAttributes.ts altered their regex patterns or output shape.",
      suggestedFix: "Check recent diffs to the three extractor files against the sample text in EXTRACTION_SAMPLE_TEXT; run `npx vitest run` for their existing unit tests.",
      affectedSubsystem: "Job ingest enrichment (salary/contact-email/job-attribute extraction)",
      docReference: "docs/decisions.md AD-21/AD-22/AD-25",
    };
  }
  return { status: "pass", summary: "All deterministic extractors produced expected output for the smoke-test sample" };
}

export function extractionServicesCheck(): Check {
  return {
    id: "app.extraction-services",
    name: "Deterministic extraction services",
    category: "application",
    severity: "medium",
    async run(): Promise<CheckOutcome> {
      return evaluateExtractionServices(EXTRACTION_SAMPLE_TEXT);
    },
  };
}
