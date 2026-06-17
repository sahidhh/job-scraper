import { describe, expect, it } from "vitest";
import { computeSkillGaps } from "./computeSkillGaps";
import type { SkillGap } from "@/features/insights/domain/types";

describe("computeSkillGaps", () => {
  it("returns an empty array when there are no jobs", () => {
    expect(computeSkillGaps(["React"], [])).toEqual([]);
  });

  it("returns an empty array when jobs have no skills", () => {
    expect(computeSkillGaps(["React"], [[], []])).toEqual([]);
  });

  it("returns an empty array when resume covers all job skills", () => {
    const resumeSkills = ["React", "TypeScript"];
    const jobsSkills = [["React", "TypeScript"], ["TypeScript"]];
    expect(computeSkillGaps(resumeSkills, jobsSkills)).toEqual([]);
  });

  it("returns gaps for skills present in jobs but absent from resume", () => {
    const resumeSkills = ["React"];
    const jobsSkills = [["React", "Kubernetes"], ["Kubernetes", "Docker"]];
    const result = computeSkillGaps(resumeSkills, jobsSkills);

    expect(result).toContainEqual<SkillGap>({ skill: "Kubernetes", demandCount: 2 });
    expect(result).toContainEqual<SkillGap>({ skill: "Docker", demandCount: 1 });
    // React is covered by resume — must NOT appear
    expect(result.map((g) => g.skill)).not.toContain("React");
  });

  it("performs case-insensitive resume exclusion ('react' in resume excludes 'React' from gaps)", () => {
    const resumeSkills = ["react", "typescript"];
    const jobsSkills = [["React", "TypeScript", "Docker"]];
    const result = computeSkillGaps(resumeSkills, jobsSkills);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<SkillGap>({ skill: "Docker", demandCount: 1 });
  });

  it("preserves original casing of skill from job list in output", () => {
    const resumeSkills: string[] = [];
    const jobsSkills = [["GraphQL"]];
    const result = computeSkillGaps(resumeSkills, jobsSkills);

    expect(result[0]?.skill).toBe("GraphQL");
  });

  it("counts a skill at most once per job even if listed multiple times in that job", () => {
    const resumeSkills: string[] = [];
    // "Docker" appears twice in job 1 — should still count as 1 job
    const jobsSkills = [["Docker", "Docker"], ["Docker"]];
    const result = computeSkillGaps(resumeSkills, jobsSkills);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<SkillGap>({ skill: "Docker", demandCount: 2 });
  });

  it("sorts by demandCount descending, then alphabetically ascending as tiebreaker", () => {
    const resumeSkills: string[] = [];
    const jobsSkills = [
      ["Zebra", "Alpha", "Beta"],
      ["Zebra", "Beta"],
      ["Zebra"],
    ];
    const result = computeSkillGaps(resumeSkills, jobsSkills);

    // Zebra: 3 jobs, Beta: 2 jobs, Alpha: 1 job
    expect(result.map((g) => g.skill)).toEqual(["Zebra", "Beta", "Alpha"]);
    expect(result.map((g) => g.demandCount)).toEqual([3, 2, 1]);
  });

  it("uses alphabetical tiebreaker when demandCounts are equal", () => {
    const resumeSkills: string[] = [];
    const jobsSkills = [["Charlie", "Alpha"], ["Charlie", "Bravo"]];
    const result = computeSkillGaps(resumeSkills, jobsSkills);

    // Charlie: 2, Alpha: 1, Bravo: 1 — Alpha before Bravo alphabetically
    expect(result.map((g) => g.skill)).toEqual(["Charlie", "Alpha", "Bravo"]);
  });

  it("handles empty resume skills array", () => {
    const jobsSkills = [["Go", "Rust"]];
    const result = computeSkillGaps([], jobsSkills);

    expect(result).toHaveLength(2);
    expect(result.map((g) => g.skill)).toEqual(["Go", "Rust"]);
  });
});
