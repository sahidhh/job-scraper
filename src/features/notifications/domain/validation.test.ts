import { describe, expect, it } from "vitest";
import { validateNotificationPreferences, validateNotifyThreshold } from "./validation";

describe("validateNotifyThreshold", () => {
  it("accepts values within [0, 1]", () => {
    expect(() => validateNotifyThreshold(0.75)).not.toThrow();
  });

  it("rejects values outside [0, 1]", () => {
    expect(() => validateNotifyThreshold(1.5)).toThrow();
  });
});

describe("validateNotificationPreferences", () => {
  it("accepts an empty preferences object", () => {
    expect(() => validateNotificationPreferences({})).not.toThrow();
  });

  it("accepts fully populated valid preferences", () => {
    expect(() =>
      validateNotificationPreferences({
        roles: ["backend engineer"],
        skills: ["ASP.NET"],
        locations: ["remote", "india"],
        sources: ["greenhouse", "lever"],
        minExperience: 2,
        maxExperience: 5,
        excludeCompanies: ["Acme"],
        excludeKeywords: ["intern"],
      }),
    ).not.toThrow();
  });

  it("rejects an unknown location", () => {
    expect(() =>
      validateNotificationPreferences({ locations: ["mars" as never] }),
    ).toThrow(/Unknown location/);
  });

  it("rejects an unknown source", () => {
    expect(() =>
      validateNotificationPreferences({ sources: ["monster" as never] }),
    ).toThrow(/Unknown source/);
  });

  it("rejects a negative minExperience", () => {
    expect(() => validateNotificationPreferences({ minExperience: -1 })).toThrow(/>= 0/);
  });

  it("rejects a negative maxExperience", () => {
    expect(() => validateNotificationPreferences({ maxExperience: -1 })).toThrow(/>= 0/);
  });

  it("rejects minExperience greater than maxExperience", () => {
    expect(() =>
      validateNotificationPreferences({ minExperience: 6, maxExperience: 3 }),
    ).toThrow(/cannot exceed/);
  });
});
