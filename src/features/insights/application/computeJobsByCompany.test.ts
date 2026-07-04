import { describe, expect, it } from "vitest";
import { computeJobsByCompany } from "./computeJobsByCompany";

describe("computeJobsByCompany", () => {
  it("returns an empty array for no rows", () => {
    expect(computeJobsByCompany([])).toEqual([]);
  });

  it("counts jobs per company and sorts descending", () => {
    const rows = [
      { companyName: "Acme" },
      { companyName: "Beta" },
      { companyName: "Acme" },
      { companyName: "Acme" },
      { companyName: "Beta" },
    ];
    expect(computeJobsByCompany(rows)).toEqual([
      { company: "Acme", count: 3 },
      { company: "Beta", count: 2 },
    ]);
  });

  it("caps the result at the top 10 companies", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      Array.from({ length: 15 - i }, () => ({ companyName: `Company ${i}` })),
    ).flat();
    const result = computeJobsByCompany(rows);
    expect(result).toHaveLength(10);
    expect(result[0]).toEqual({ company: "Company 0", count: 15 });
  });
});
