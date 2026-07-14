import { describe, expect, it } from "vitest";
import { DomainValidationError } from "@/shared/domain/errors";
import { validateParsedText } from "./validation";

describe("validateParsedText", () => {
  it("accepts normal resume text", () => {
    expect(() => validateParsedText("Experienced software engineer with 5 years of React and Node.js")).not.toThrow();
  });

  it("rejects an empty string (e.g. a scanned/image-only PDF)", () => {
    expect(() => validateParsedText("")).toThrow(DomainValidationError);
  });

  it("rejects whitespace-only text", () => {
    expect(() => validateParsedText("   \n\n\t  ")).toThrow(DomainValidationError);
  });

  it("rejects text shorter than the minimum readable length", () => {
    expect(() => validateParsedText("Hi")).toThrow(DomainValidationError);
  });
});
