import { describe, expect, it } from "vitest";
import { computeSkillDemand } from "./computeSkillDemand";
import type { SkillDemand } from "@/features/insights/domain/types";

describe("computeSkillDemand", () => {
  it("returns an empty array when there are no jobs", () => {
    expect(computeSkillDemand([])).toEqual([]);
  });

  it("returns an empty array when jobs have no skills", () => {
    expect(computeSkillDemand([[], []])).toEqual([]);
  });

  it("counts each distinct skill by the number of jobs that mention it", () => {
    const jobsSkills = [
      ["React", "TypeScript"],
      ["React", "Docker"],
      ["Docker"],
    ];
    const result = computeSkillDemand(jobsSkills);

    expect(result).toContainEqual<SkillDemand>({ skill: "React", count: 2 });
    expect(result).toContainEqual<SkillDemand>({ skill: "Docker", count: 2 });
    expect(result).toContainEqual<SkillDemand>({ skill: "TypeScript", count: 1 });
  });

  it("includes all skills regardless of whether the resume covers them", () => {
    // computeSkillDemand has no knowledge of resume — it counts all job skills
    const jobsSkills = [["Python", "SQL"]];
    const result = computeSkillDemand(jobsSkills);

    expect(result.map((d) => d.skill)).toContain("Python");
    expect(result.map((d) => d.skill)).toContain("SQL");
  });

  it("counts a skill at most once per job even if listed multiple times in that job", () => {
    // "Kubernetes" duplicated within job 1 — must count as 1 job mention
    const jobsSkills = [["Kubernetes", "Kubernetes"], ["Kubernetes"]];
    const result = computeSkillDemand(jobsSkills);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<SkillDemand>({ skill: "Kubernetes", count: 2 });
  });

  it("sorts by count descending, then alphabetically ascending as tiebreaker", () => {
    const jobsSkills = [
      ["Go", "Rust", "Python"],
      ["Go", "Rust"],
      ["Go"],
    ];
    const result = computeSkillDemand(jobsSkills);

    // Go: 3, Rust: 2, Python: 1
    expect(result.map((d) => d.skill)).toEqual(["Go", "Rust", "Python"]);
    expect(result.map((d) => d.count)).toEqual([3, 2, 1]);
  });

  it("uses alphabetical tiebreaker when counts are equal", () => {
    const jobsSkills = [
      ["Charlie", "Alpha"],
      ["Charlie", "Bravo"],
    ];
    const result = computeSkillDemand(jobsSkills);

    // Charlie: 2, Alpha: 1, Bravo: 1 — Alpha before Bravo alphabetically
    expect(result.map((d) => d.skill)).toEqual(["Charlie", "Alpha", "Bravo"]);
  });

  it("handles a single job with multiple unique skills", () => {
    const jobsSkills = [["Elixir", "Phoenix", "PostgreSQL"]];
    const result = computeSkillDemand(jobsSkills);

    expect(result).toHaveLength(3);
    // All have count 1; should be sorted alphabetically
    expect(result.map((d) => d.skill)).toEqual(["Elixir", "Phoenix", "PostgreSQL"]);
    result.forEach((d) => expect(d.count).toBe(1));
  });
});
