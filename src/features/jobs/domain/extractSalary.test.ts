import { describe, expect, it } from "vitest";
import { extractSalary } from "./extractSalary";

describe("extractSalary", () => {
  it("parses a rupee-symbol LPA range", () => {
    expect(extractSalary("Compensation: ₹18-24 LPA")).toEqual({
      currency: "INR",
      min: 1_800_000,
      max: 2_400_000,
      period: "yearly",
      confidence: "high",
    });
  });

  it("parses a bare LPA figure with no range and no symbol", () => {
    expect(extractSalary("Salary: 20 LPA")).toEqual({
      currency: "INR",
      min: 2_000_000,
      max: 2_000_000,
      period: "yearly",
      confidence: "high",
    });
  });

  it("parses a dollar-k-per-year figure", () => {
    expect(extractSalary("We offer $120k/year")).toEqual({
      currency: "USD",
      min: 120_000,
      max: 120_000,
      period: "yearly",
      confidence: "high",
    });
  });

  it("parses a number-currency-code-per-hour figure", () => {
    expect(extractSalary("Pay rate: 35 USD/hour")).toEqual({
      currency: "USD",
      min: 35,
      max: 35,
      period: "hourly",
      confidence: "high",
    });
  });

  it("records 'Negotiable' as an explicit no-figure salary mention", () => {
    expect(extractSalary("Salary: Negotiable")).toEqual({
      currency: null,
      min: null,
      max: null,
      period: null,
      confidence: "low",
    });
  });

  it("records 'Competitive' as an explicit no-figure salary mention", () => {
    expect(extractSalary("We offer a competitive salary")).toEqual({
      currency: null,
      min: null,
      max: null,
      period: null,
      confidence: "low",
    });
  });

  it("returns null when there is no salary-related text at all", () => {
    expect(extractSalary("We are looking for a senior engineer with 5+ years of experience.")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractSalary("")).toBeNull();
  });

  it("does not mistake a bare number (e.g. years of experience) for a salary", () => {
    expect(extractSalary("Requires 5-8 years of experience in backend systems.")).toBeNull();
  });

  it("parses an SGD range with a monthly period", () => {
    expect(extractSalary("Salary: S$8,000-10,000/month")).toEqual({
      currency: "SGD",
      min: 8_000,
      max: 10_000,
      period: "monthly",
      confidence: "high",
    });
  });

  it("parses a lakhs range without the LPA abbreviation", () => {
    expect(extractSalary("Package: 8-10 lakhs per annum")).toEqual({
      currency: "INR",
      min: 800_000,
      max: 1_000_000,
      period: "yearly",
      confidence: "high",
    });
  });

  it("parses an AED figure with an explicit period", () => {
    expect(extractSalary("Salary: 15000 AED per month")).toEqual({
      currency: "AED",
      min: 15_000,
      max: 15_000,
      period: "monthly",
      confidence: "high",
    });
  });

  it("assigns medium confidence when a currency is found but no period", () => {
    expect(extractSalary("Salary: $80,000-90,000")).toEqual({
      currency: "USD",
      min: 80_000,
      max: 90_000,
      period: null,
      confidence: "medium",
    });
  });

  it("parses an Rs.-prefixed figure with an explicit period", () => {
    expect(extractSalary("Salary: Rs. 50,000/month")).toEqual({
      currency: "INR",
      min: 50_000,
      max: 50_000,
      period: "monthly",
      confidence: "high",
    });
  });

  it("assigns medium confidence when a period is found but no currency", () => {
    expect(extractSalary("Compensation: 5000-7000 per month")).toEqual({
      currency: null,
      min: 5_000,
      max: 7_000,
      period: "monthly",
      confidence: "medium",
    });
  });
});
