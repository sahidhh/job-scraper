import { describe, expect, it } from "vitest";
import { extractContactEmail } from "./extractContactEmail";

describe("extractContactEmail", () => {
  it("returns null when no email is present", () => {
    expect(extractContactEmail("Apply via our website.")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractContactEmail("")).toBeNull();
  });

  it("categorizes a recruiting-keyword address as recruiter with high confidence", () => {
    expect(extractContactEmail("Send your resume to recruiting@techcorp.sg")).toEqual({
      email: "recruiting@techcorp.sg",
      category: "recruiter",
      confidence: "high",
    });
  });

  it("categorizes an hr-keyword address as hr with high confidence", () => {
    expect(extractContactEmail("Contact hr@startup.io")).toEqual({
      email: "hr@startup.io",
      category: "hr",
      confidence: "high",
    });
  });

  it("categorizes a hiringmanager-keyword address as hiring_manager with medium confidence", () => {
    expect(extractContactEmail("Reach out to hiringmanager@startup.io")).toEqual({
      email: "hiringmanager@startup.io",
      category: "hiring_manager",
      confidence: "medium",
    });
  });

  it("categorizes a generic careers/jobs mailbox as company_contact with medium confidence", () => {
    expect(extractContactEmail("Apply to careers@startup.io")).toEqual({
      email: "careers@startup.io",
      category: "company_contact",
      confidence: "medium",
    });
  });

  it("categorizes a personal-name address with no keyword match as company_contact with low confidence", () => {
    expect(extractContactEmail("Send CV to jane.doe@techcorp.sg")).toEqual({
      email: "jane.doe@techcorp.sg",
      category: "company_contact",
      confidence: "low",
    });
  });

  it("excludes fully-automated mailboxes and falls back to the next candidate", () => {
    const text = "noreply@ats.com is automated. Reach recruiting@company.com for details.";
    expect(extractContactEmail(text)).toEqual({
      email: "recruiting@company.com",
      category: "recruiter",
      confidence: "high",
    });
  });

  it("returns null when every email found is automated", () => {
    expect(extractContactEmail("Sent from noreply@ats.com, do-not-reply@ats.com")).toBeNull();
  });

  it("prefers recruiter over hr over hiring_manager over company_contact regardless of order in the text", () => {
    const text = "Contact hello@co.com, hiringmanager@co.com, hr@co.com, or recruiting@co.com";
    expect(extractContactEmail(text)?.category).toBe("recruiter");
  });

  it("de-duplicates the same email mentioned twice, case-insensitively", () => {
    const text = "Email Jane@Company.com or jane@company.com for details.";
    const result = extractContactEmail(text);
    expect(result?.email.toLowerCase()).toBe("jane@company.com");
  });

  it("does not miscategorize a personal-name address containing 'hr' as a substring (e.g. chris, shreya)", () => {
    // Regression test: the "hr" keyword used to match anywhere in the local
    // part, so "chris"/"shreya" (which both contain "hr") were wrongly
    // categorized as hr/high instead of a personal name/low.
    expect(extractContactEmail("Send CV to chris@techcorp.sg")).toEqual({
      email: "chris@techcorp.sg",
      category: "company_contact",
      confidence: "low",
    });
    expect(extractContactEmail("Send CV to shreya@techcorp.sg")).toEqual({
      email: "shreya@techcorp.sg",
      category: "company_contact",
      confidence: "low",
    });
  });

  it("does not miscategorize outsourcing@ as a recruiter address", () => {
    // Regression test: "sourcing" used to match as a substring of
    // "outsourcing", which is an unrelated vendor/company-contact mailbox.
    expect(extractContactEmail("Contact our vendor at outsourcing@company.com")).toEqual({
      email: "outsourcing@company.com",
      category: "company_contact",
      confidence: "low",
    });
  });

  it("still categorizes hyphenated/dotted hr and talent-sourcing addresses correctly", () => {
    expect(extractContactEmail("Contact hr-team@startup.io")?.category).toBe("hr");
    expect(extractContactEmail("Contact jane.hr@startup.io")?.category).toBe("hr");
    expect(extractContactEmail("Contact talent-sourcing@startup.io")?.category).toBe("recruiter");
  });

  it("excludes an automated mailbox even when plus-addressed with a tag", () => {
    // Regression test: "noreply+jobs@ats.com" used to slip past the
    // automated-prefix filter (exact match on the full local part) and get
    // categorized as a real company_contact via the "jobs" keyword.
    const text = "noreply+jobs@ats.com is automated. Reach recruiting@company.com for details.";
    expect(extractContactEmail(text)).toEqual({
      email: "recruiting@company.com",
      category: "recruiter",
      confidence: "high",
    });
  });
});
