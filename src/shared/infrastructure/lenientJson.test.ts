import { describe, expect, it } from "vitest";
import { parseLenientJson } from "./lenientJson";

describe("parseLenientJson", () => {
  it("parses plain JSON", () => {
    expect(parseLenientJson<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });

  it("strips a ```json code fence", () => {
    expect(parseLenientJson<number[]>('```json\n[1, 2, 3]\n```')).toEqual([1, 2, 3]);
  });

  it("strips a bare ``` code fence", () => {
    expect(parseLenientJson<number[]>("```\n[1, 2]\n```")).toEqual([1, 2]);
  });

  it("extracts a JSON array from surrounding prose", () => {
    expect(parseLenientJson<number[]>('Here you go:\n[1, 2, 3]\nHope that helps!')).toEqual([1, 2, 3]);
  });

  it("extracts a JSON object from surrounding prose", () => {
    expect(parseLenientJson<{ a: number }>('Sure -- {"a": 1} -- done')).toEqual({ a: 1 });
  });

  it("returns null for unparseable garbage", () => {
    expect(parseLenientJson("not json at all")).toBeNull();
  });

  it("returns null for a string with brackets that still isn't valid JSON", () => {
    expect(parseLenientJson("[not, valid, json")).toBeNull();
  });
});
