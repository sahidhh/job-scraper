import { describe, expect, it } from "vitest";
import { DomainValidationError } from "@/shared/domain/errors";
import { validateNotificationPreferences, validateNotifyThreshold } from "./validation";

describe("validateNotifyThreshold", () => {
  it("accepts values within [0, 1]", () => {
    expect(() => validateNotifyThreshold(0.75)).not.toThrow();
  });

  it("rejects values outside [0, 1]", () => {
    expect(() => validateNotifyThreshold(1.5)).toThrow(DomainValidationError);
  });
});

describe("validateNotificationPreferences", () => {
  it("accepts an empty preferences object", () => {
    expect(() => validateNotificationPreferences({})).not.toThrow();
  });

  it("accepts a fully-populated valid preferences object", () => {
    expect(() =>
      validateNotificationPreferences({
        roles: ["backend engineer"],
        skills: ["React"],
        locations: ["remote", "india"],
        sources: ["greenhouse", "lever"],
        minExperience: 2,
        maxExperience: 5,
        blockedCompanies: ["Staffing Co"],
        excludeEmploymentTypes: ["internship", "contract"],
        excludeKeywords: ["intern"],
      }),
    ).not.toThrow();
  });

  it("rejects an invalid location", () => {
    expect(() => validateNotificationPreferences({ locations: ["mars" as never] })).toThrow(DomainValidationError);
  });

  it("rejects an invalid source", () => {
    expect(() => validateNotificationPreferences({ sources: ["linkedin" as never] })).toThrow(DomainValidationError);
  });

  it("rejects an invalid employment type", () => {
    expect(() => validateNotificationPreferences({ excludeEmploymentTypes: ["bogus" as never] })).toThrow(
      DomainValidationError,
    );
  });

  it("rejects a negative minExperience", () => {
    expect(() => validateNotificationPreferences({ minExperience: -1 })).toThrow(DomainValidationError);
  });

  it("rejects a negative maxExperience", () => {
    expect(() => validateNotificationPreferences({ maxExperience: -1 })).toThrow(DomainValidationError);
  });

  it("rejects minExperience greater than maxExperience", () => {
    expect(() => validateNotificationPreferences({ minExperience: 5, maxExperience: 2 })).toThrow(
      DomainValidationError,
    );
  });
});
