import { describe, expect, it } from "vitest";
import { validateApplicationContent } from "./validation";

describe("validateApplicationContent", () => {
  it("accepts non-empty body", () => {
    expect(() => validateApplicationContent("Application for Engineer", "Dear hiring team,")).not.toThrow();
  });

  it("accepts an empty subject", () => {
    expect(() => validateApplicationContent("", "Dear hiring team,")).not.toThrow();
  });

  it("rejects empty body", () => {
    expect(() => validateApplicationContent("Subject", "   ")).toThrow("body cannot be empty");
  });

  it("rejects an overlong subject", () => {
    expect(() => validateApplicationContent("x".repeat(999), "body")).toThrow("too long");
  });
});
