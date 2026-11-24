import { describe, expect, it } from "vitest";
import { hasRoleFilter, jobMatchesRoles } from "./roleMatch";

describe("hasRoleFilter", () => {
  it("returns false for an empty roles array", () => {
    expect(hasRoleFilter([])).toBe(false);
  });

  it("returns false when every role sanitizes to an empty string", () => {
    expect(hasRoleFilter(["", "   ", ",()%*"])).toBe(false);
  });

  it("returns true when at least one role has a usable term", () => {
    expect(hasRoleFilter(["", "Backend Engineer"])).toBe(true);
  });
});

describe("jobMatchesRoles", () => {
  const job = {
    title: "Backend Engineer",
    description: "Build APIs with Node.js and Postgres.",
  };

  it("returns true (no filter) when roles is empty and title is not denylisted", () => {
    expect(jobMatchesRoles(job, [])).toBe(true);
  });

  it("returns true when a role term matches the title case-insensitively", () => {
    expect(jobMatchesRoles(job, ["backend engineer"])).toBe(true);
  });

  it("returns false when a role term matches only the description and not title or allowlist", () => {
    expect(
      jobMatchesRoles(
        { title: "Product Designer", description: "Build APIs with Postgres and Software Engineer." },
        ["Postgres"],
      ),
    ).toBe(false);
  });

  it("returns false when no role term or allowlist matches title", () => {
    expect(
      jobMatchesRoles(
        { title: "Office Coordinator", description: "Manage office." },
        ["Sales Representative", "Office Manager"],
      ),
    ).toBe(false);
  });

  it("matches if any one of multiple roles matches", () => {
    expect(jobMatchesRoles(job, ["Sales Representative", "Backend Engineer"])).toBe(true);
  });

  it("ignores unsafe filter characters when sanitizing role terms", () => {
    const cloudJob = { title: "Cloud Engineer", description: "" };
    expect(jobMatchesRoles(cloudJob, ["Cloud Engineer (Remote)*"])).toBe(false);
    expect(jobMatchesRoles(cloudJob, ["Cloud Engineer*"])).toBe(true);
  });

  it("preserves dots in .net so it does not false-match Kubernetes or Network", () => {
    expect(
      jobMatchesRoles({ title: "Kubernetes Platform", description: "" }, [".net"]),
    ).toBe(false);
    expect(
      jobMatchesRoles({ title: ".NET Developer", description: "" }, [".net"]),
    ).toBe(true);
  });

  it("rejects denylisted titles even when description contains Software Engineer", () => {
    for (const title of [
      "Senior Software Engineer",
      "Sr. Software Engineer",
      "Staff Software Engineer",
      "Lead Backend Engineer",
      "Sales Engineer",
      "QA Engineer",
      "Java Developer",
    ]) {
      expect(
        jobMatchesRoles({ title, description: "Software Engineer" }, ["Software Engineer"]),
      ).toBe(false);
    }
  });

  it("does not false-block JavaScript for java or Aqua for qa", () => {
    expect(
      jobMatchesRoles({ title: "JavaScript Developer", description: "" }, ["Developer"]),
    ).toBe(true);
    expect(
      jobMatchesRoles({ title: "Aqua Software Engineer", description: "" }, ["Software Engineer"]),
    ).toBe(true);
  });
});
