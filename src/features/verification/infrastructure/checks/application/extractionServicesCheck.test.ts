import { describe, expect, it } from "vitest";
import { EXTRACTION_SAMPLE_TEXT, evaluateExtractionServices } from "./extractionServicesCheck";

describe("evaluateExtractionServices", () => {
  it("passes for the fixed sample text (regression guard for the extractors)", () => {
    const outcome = evaluateExtractionServices(EXTRACTION_SAMPLE_TEXT);

    expect(outcome.status).toBe("pass");
  });

  it("fails when the sample no longer contains an extractable salary", () => {
    const outcome = evaluateExtractionServices("Just a plain job description with no salary or email.");

    expect(outcome.status).toBe("fail");
    expect(outcome.details?.some((d) => d.startsWith("extractSalary"))).toBe(true);
  });

  it("fails when the sample no longer contains the expected contact email", () => {
    const outcome = evaluateExtractionServices("Senior Backend Engineer (Contract, Remote) - Urgent hiring! Salary: $90,000 - $120,000 per year.");

    expect(outcome.status).toBe("fail");
    expect(outcome.details?.some((d) => d.startsWith("extractContactEmail"))).toBe(true);
  });
});
