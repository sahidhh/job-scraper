import { describe, expect, it, vi } from "vitest";
import type { CompanyRepository } from "@/features/companies/domain/CompanyRepository";
import type { Company } from "@/features/companies/domain/types";
import type { SourceValidator, ValidationStatus } from "@/features/sources/domain/sourceValidation";
import { validateSources } from "./validateSources";

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-1",
    name: "Acme",
    source: "greenhouse",
    boardToken: "acme",
    active: true,
    createdAt: new Date().toISOString(),
    healthStatus: "active",
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    ...overrides,
  };
}

function makeValidator(status: ValidationStatus): SourceValidator {
  return {
    source: "greenhouse",
    validate: vi.fn().mockResolvedValue({
      companyName: "Acme",
      boardToken: "acme",
      status,
      httpStatus: status === "healthy" ? 200 : 404,
    }),
  };
}

function makeRepo(): CompanyRepository & { updateHealth: ReturnType<typeof vi.fn> } {
  return {
    listActive: vi.fn(),
    listActiveHealthy: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateHealth: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
  };
}

describe("validateSources", () => {
  it("active → healthy: previousHealthStatus is 'active', result.status is 'healthy'", async () => {
    const company = makeCompany({ healthStatus: "active" });
    const validator = makeValidator("healthy");
    const repo = makeRepo();

    const groups = await validateSources([validator], [company], repo);

    expect(groups).toHaveLength(1);
    const outcome = groups[0]!.results[0]!;
    expect(outcome.previousHealthStatus).toBe("active");
    expect(outcome.status).toBe("healthy");
  });

  it("active → not_found: previousHealthStatus is 'active', result.status is 'not_found' (IS a new failure)", async () => {
    const company = makeCompany({ healthStatus: "active" });
    const validator = makeValidator("not_found");
    const repo = makeRepo();

    const groups = await validateSources([validator], [company], repo);

    const outcome = groups[0]!.results[0]!;
    expect(outcome.previousHealthStatus).toBe("active");
    expect(outcome.status).toBe("not_found");

    const isNewFailure =
      outcome.previousHealthStatus === "active" &&
      outcome.status !== "healthy" &&
      outcome.status !== "redirected";
    expect(isNewFailure).toBe(true);
  });

  it("unhealthy → not_found: previousHealthStatus is 'unhealthy' (NOT a new failure)", async () => {
    const company = makeCompany({ healthStatus: "unhealthy", consecutiveFailures: 3 });
    const validator = makeValidator("not_found");
    const repo = makeRepo();

    const groups = await validateSources([validator], [company], repo);

    const outcome = groups[0]!.results[0]!;
    expect(outcome.previousHealthStatus).toBe("unhealthy");
    expect(outcome.status).toBe("not_found");

    const isNewFailure =
      outcome.previousHealthStatus === "active" &&
      outcome.status !== "healthy" &&
      outcome.status !== "redirected";
    expect(isNewFailure).toBe(false);
  });

  it("unhealthy → healthy (recovery): previousHealthStatus is 'unhealthy', result.status is 'healthy'", async () => {
    const company = makeCompany({ healthStatus: "unhealthy", consecutiveFailures: 2 });
    const validator = makeValidator("healthy");
    const repo = makeRepo();

    const groups = await validateSources([validator], [company], repo);

    const outcome = groups[0]!.results[0]!;
    expect(outcome.previousHealthStatus).toBe("unhealthy");
    expect(outcome.status).toBe("healthy");

    const isNewFailure =
      outcome.previousHealthStatus === "active" &&
      outcome.status !== "healthy" &&
      outcome.status !== "redirected";
    expect(isNewFailure).toBe(false);
  });

  it("disabled company is excluded by default", async () => {
    const company = makeCompany({ healthStatus: "disabled" });
    const validator = makeValidator("healthy");
    const repo = makeRepo();

    const groups = await validateSources([validator], [company], repo);

    expect(groups[0]!.results).toHaveLength(0);
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it("disabled company is included when includeDisabled=true", async () => {
    const company = makeCompany({ healthStatus: "disabled" });
    const validator = makeValidator("healthy");
    const repo = makeRepo();

    const groups = await validateSources([validator], [company], repo, true);

    expect(groups[0]!.results).toHaveLength(1);
    expect(validator.validate).toHaveBeenCalledOnce();
  });

  it("updateHealth is called with correct values after a failure (consecutiveFailures incremented)", async () => {
    const company = makeCompany({ healthStatus: "active", consecutiveFailures: 2 });
    const validator = makeValidator("not_found");
    const repo = makeRepo();

    await validateSources([validator], [company], repo);

    expect(repo.updateHealth).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        healthStatus: "unhealthy",
        consecutiveFailures: 3,
      }),
    );
  });

  it("updateHealth is called with reset values after a recovery", async () => {
    const company = makeCompany({ healthStatus: "unhealthy", consecutiveFailures: 3 });
    const validator = makeValidator("healthy");
    const repo = makeRepo();

    await validateSources([validator], [company], repo);

    expect(repo.updateHealth).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        healthStatus: "active",
        consecutiveFailures: 0,
      }),
    );
  });

  it("threshold check: consecutiveFailures reaches threshold → status becomes 'disabled'", async () => {
    const company = makeCompany({ healthStatus: "unhealthy", consecutiveFailures: 6 });
    const validator = makeValidator("not_found");
    const repo = makeRepo();

    await validateSources([validator], [company], repo);

    expect(repo.updateHealth).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        healthStatus: "disabled",
        consecutiveFailures: 7,
      }),
    );
  });
});
