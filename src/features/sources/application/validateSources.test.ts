import { describe, expect, it, vi } from "vitest";
import type { Company } from "@/features/companies/domain/types";
import type { SourceValidator, ValidationResult } from "@/features/sources/domain/sourceValidation";
import { validateSources } from "./validateSources";

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "c1",
    name: "Acme",
    source: "greenhouse",
    boardToken: "acme",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeValidator(
  source: SourceValidator["source"],
  result: ValidationResult,
): SourceValidator {
  return { source, validate: vi.fn().mockResolvedValue(result) };
}

const HEALTHY: ValidationResult = {
  companyName: "Acme",
  boardToken: "acme",
  status: "healthy",
  httpStatus: 200,
};

const NOT_FOUND: ValidationResult = {
  companyName: "Dead",
  boardToken: "dead",
  status: "not_found",
  httpStatus: 404,
};

describe("validateSources", () => {
  it("returns one group per validator", async () => {
    const ghValidator = makeValidator("greenhouse", HEALTHY);
    const lvValidator = makeValidator("lever", NOT_FOUND);

    const companies: Company[] = [
      makeCompany({ source: "greenhouse", boardToken: "acme" }),
      makeCompany({ id: "c2", name: "Dead", source: "lever", boardToken: "dead" }),
    ];

    const groups = await validateSources([ghValidator, lvValidator], companies);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.source).toBe("greenhouse");
    expect(groups[0]?.results).toHaveLength(1);
    expect(groups[0]?.results[0]?.status).toBe("healthy");
    expect(groups[1]?.source).toBe("lever");
    expect(groups[1]?.results[0]?.status).toBe("not_found");
  });

  it("skips companies with null boardToken", async () => {
    const validator = makeValidator("greenhouse", HEALTHY);
    const companies: Company[] = [
      makeCompany({ boardToken: null }),
    ];

    const groups = await validateSources([validator], companies);

    expect(groups[0]?.results).toHaveLength(0);
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it("skips inactive companies", async () => {
    const validator = makeValidator("greenhouse", HEALTHY);
    const companies: Company[] = [
      makeCompany({ active: false }),
    ];

    const groups = await validateSources([validator], companies);

    expect(groups[0]?.results).toHaveLength(0);
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it("groups multiple companies under the same validator", async () => {
    const result1: ValidationResult = { companyName: "A", boardToken: "a", status: "healthy", httpStatus: 200 };
    const result2: ValidationResult = { companyName: "B", boardToken: "b", status: "not_found", httpStatus: 404 };
    const validator: SourceValidator = {
      source: "greenhouse",
      validate: vi.fn()
        .mockResolvedValueOnce(result1)
        .mockResolvedValueOnce(result2),
    };

    const companies: Company[] = [
      makeCompany({ id: "c1", name: "A", boardToken: "a" }),
      makeCompany({ id: "c2", name: "B", boardToken: "b" }),
    ];

    const groups = await validateSources([validator], companies);

    expect(groups[0]?.results).toHaveLength(2);
  });

  it("returns empty results when no companies match a validator's source", async () => {
    const validator = makeValidator("ashby", HEALTHY);
    const companies: Company[] = [
      makeCompany({ source: "lever" }),
    ];

    const groups = await validateSources([validator], companies);

    expect(groups[0]?.results).toHaveLength(0);
  });
});
