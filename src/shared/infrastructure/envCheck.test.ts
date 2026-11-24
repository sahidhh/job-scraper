import { afterEach, describe, expect, it } from "vitest";
import { checkRequiredVar } from "./envCheck";

describe("checkRequiredVar", () => {
  const keys = ["TEST_PRIMARY_KEY", "TEST_LEGACY_KEY"];

  afterEach(() => {
    for (const key of keys) {
      delete process.env[key];
    }
  });

  it("passes with primary key detail when primary is set", () => {
    process.env.TEST_PRIMARY_KEY = "sb_publishable_123";
    expect(checkRequiredVar("TEST_PRIMARY_KEY", "TEST_LEGACY_KEY")).toEqual({
      status: "pass",
      label: "TEST_PRIMARY_KEY",
      detail: "set",
    });
  });

  it("passes with legacy fallback detail when only the legacy alias is set", () => {
    process.env.TEST_LEGACY_KEY = "eyJ-legacy";
    expect(checkRequiredVar("TEST_PRIMARY_KEY", "TEST_LEGACY_KEY")).toEqual({
      status: "pass",
      label: "TEST_PRIMARY_KEY",
      detail: "set via TEST_LEGACY_KEY (legacy)",
    });
  });

  it("fails cleanly when neither primary nor legacy alias is set", () => {
    expect(checkRequiredVar("TEST_PRIMARY_KEY")).toEqual({
      status: "fail",
      label: "TEST_PRIMARY_KEY",
      detail: "missing (required)",
    });
    expect(checkRequiredVar("TEST_PRIMARY_KEY", "TEST_LEGACY_KEY")).toEqual({
      status: "fail",
      label: "TEST_PRIMARY_KEY",
      detail: "missing (required; legacy TEST_LEGACY_KEY also unset)",
    });
  });
});
