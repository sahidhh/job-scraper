import { describe, expect, it } from "vitest";
import { hasRoleFilter, jobMatchesRoles } from "./roleMatch";

describe("hasRoleFilter", () => {
  it("returns false for an empty roles array", () => {
    expect(hasRoleFilter([])).toBe(false);
  });

  it("returns false when every role sanitizes to an empty string", () => {
    expect(hasRoleFilter(["", "   ", ".,()%*"])).toBe(false);
  });

  it("returns true when at least one role has a usable term", () => {
    expect(hasRoleFilter(["", "Backend Engineer"])).toBe(true);
  });
});

describe("jobMatchesRoles", () => {
  const job = {
    title: "Senior Backend Engineer",
    description: "Build APIs with Node.js and Postgres.",
  };

  it("returns true (no filter) when roles is empty", () => {
    expect(jobMatchesRoles(job, [])).toBe(true);
  });

  it("returns true when a role term matches the title case-insensitively", () => {
    expect(jobMatchesRoles(job, ["backend engineer"])).toBe(true);
  });

  it("returns true when a role term matches the description but not the title", () => {
    expect(jobMatchesRoles(job, ["Postgres"])).toBe(true);
  });

  it("returns false when no role term matches title or description", () => {
    expect(jobMatchesRoles(job, ["Sales Representative", "Office Manager"])).toBe(false);
  });

  it("matches if any one of multiple roles matches", () => {
    expect(jobMatchesRoles(job, ["Sales Representative", "Backend Engineer"])).toBe(true);
  });

  it("ignores unsafe filter characters when sanitizing role terms", () => {
    expect(jobMatchesRoles(job, ["Backend Engineer (Remote)*"])).toBe(false);
    expect(jobMatchesRoles(job, ["Backend Engineer*"])).toBe(true);
  });

  it("treats a role that sanitizes to empty as no-op for that term", () => {
    expect(jobMatchesRoles(job, ["...", "Backend Engineer"])).toBe(true);
    expect(jobMatchesRoles({ title: "Unrelated Title", description: "Unrelated description." }, ["...", ""])).toBe(true);
  });
});
