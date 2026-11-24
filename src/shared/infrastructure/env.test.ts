import { afterEach, describe, expect, it } from "vitest";
import { hasAnyEnv, requireEnv } from "./env";

describe("env helpers", () => {
  const keys = ["TEST_PRIMARY_KEY", "TEST_LEGACY_KEY"];

  afterEach(() => {
    for (const key of keys) {
      delete process.env[key];
    }
  });

  it("requireEnv prefers the first non-empty key and falls back to legacy aliases", () => {
    process.env.TEST_LEGACY_KEY = "legacy-val";
    expect(requireEnv("TEST_PRIMARY_KEY", "TEST_LEGACY_KEY")).toBe("legacy-val");

    process.env.TEST_PRIMARY_KEY = "primary-val";
    expect(requireEnv("TEST_PRIMARY_KEY", "TEST_LEGACY_KEY")).toBe("primary-val");
  });

  it("requireEnv treats whitespace-only primary values as unset", () => {
    process.env.TEST_PRIMARY_KEY = "   ";
    process.env.TEST_LEGACY_KEY = "legacy-val";
    expect(requireEnv("TEST_PRIMARY_KEY", "TEST_LEGACY_KEY")).toBe("legacy-val");
  });

  it("requireEnv throws a clear error listing checked names when none are set", () => {
    expect(() => requireEnv("TEST_PRIMARY_KEY")).toThrow("Missing required environment variable: TEST_PRIMARY_KEY");
    expect(() => requireEnv("TEST_PRIMARY_KEY", "TEST_LEGACY_KEY")).toThrow(
      "Missing required environment variable: TEST_PRIMARY_KEY or TEST_LEGACY_KEY",
    );
  });

  it("hasAnyEnv returns true when any candidate env var is non-empty", () => {
    expect(hasAnyEnv("TEST_PRIMARY_KEY", "TEST_LEGACY_KEY")).toBe(false);
    process.env.TEST_LEGACY_KEY = "val";
    expect(hasAnyEnv("TEST_PRIMARY_KEY", "TEST_LEGACY_KEY")).toBe(true);
  });
});
