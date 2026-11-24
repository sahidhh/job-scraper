import { describe, expect, it } from "vitest";
import { buildRoleFilter, sanitizeRoleForFilter } from "./roleFilter";

describe("sanitizeRoleForFilter", () => {
  it("strips unsafe PostgREST characters while preserving dots", () => {
    expect(sanitizeRoleForFilter(".NET (Remote)*,")).toBe(".NET Remote");
  });
});

describe("buildRoleFilter", () => {
  it("returns null when no usable roles remain", () => {
    expect(buildRoleFilter(["", " ,()%* "])).toBeNull();
  });

  it("emits title.ilike clauses only and never description.ilike", () => {
    const filter = buildRoleFilter(["Software Engineer", ".NET"]);
    expect(filter).toBe("title.ilike.%Software Engineer%,title.ilike.%.NET%");
    expect(filter).not.toContain("description.ilike");
  });
});
