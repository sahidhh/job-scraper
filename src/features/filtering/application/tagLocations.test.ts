import { describe, expect, it } from "vitest";
import type { RawJob } from "@/features/sources/domain/types";
import { tagLocations } from "./tagLocations";

function makeRawJob(overrides: Partial<RawJob> = {}): RawJob {
  return {
    source: "greenhouse",
    sourceJobId: "1",
    companyId: null,
    companyName: "Acme",
    title: "Engineer",
    locationRaw: "",
    description: "",
    url: "https://example.com/jobs/1",
    postedAt: null,
    ...overrides,
  };
}

describe("tagLocations", () => {
  it("tags jobs matching a single location keyword rule", () => {
    const jobs = [
      makeRawJob({ sourceJobId: "1", locationRaw: "Bengaluru, India" }),
      makeRawJob({ sourceJobId: "2", locationRaw: "Dubai, UAE" }),
      makeRawJob({ sourceJobId: "3", locationRaw: "Berlin, Germany" }),
    ];

    const result = tagLocations(jobs);

    expect(result[0]?.locationTags).toEqual(["india"]);
    expect(result[1]?.locationTags).toEqual(["uae"]);
    expect(result[2]?.locationTags).toEqual([]);
  });

  it("drops jobs with empty locationRaw (no rule can match)", () => {
    const [result] = tagLocations([makeRawJob({ locationRaw: "" })]);

    expect(result?.locationTags).toEqual([]);
  });

  it("matches case-insensitively and can assign multiple tags", () => {
    const [result] = tagLocations([makeRawJob({ locationRaw: "SINGAPORE (Remote OK)" })]);

    expect(result?.locationTags).toEqual(["singapore", "remote"]);
  });

  it("preserves all RawJob fields alongside the new locationTags field", () => {
    const job = makeRawJob({ locationRaw: "Remote" });

    const [tagged] = tagLocations([job]);

    expect(tagged).toEqual({ ...job, locationTags: ["remote"] });
  });

  it("does not tag Indiana, USA as india", () => {
    const [result] = tagLocations([makeRawJob({ locationRaw: "Indiana, USA" })]);

    expect(result?.locationTags).toEqual([]);
  });

  it("still tags a standalone India location correctly", () => {
    const [result] = tagLocations([makeRawJob({ locationRaw: "India" })]);

    expect(result?.locationTags).toEqual(["india"]);
  });

  it("tags a compound India location correctly", () => {
    const [result] = tagLocations([makeRawJob({ locationRaw: "Mumbai, India" })]);

    expect(result?.locationTags).toEqual(["india"]);
  });
});

describe("tagLocations -- Saudi Arabia and Qatar (#226)", () => {
  it("tags Saudi cities, the country name, and KSA as saudi", () => {
    const raws = ["Riyadh", "Jeddah, Saudi Arabia", "Dammam - KSA", "Al Khobar", "Saudi"];
    const result = tagLocations(raws.map((locationRaw, i) => makeRawJob({ sourceJobId: String(i), locationRaw })));

    for (const job of result) expect(job.locationTags).toEqual(["saudi"]);
  });

  it("tags Doha and Qatar as qatar", () => {
    const result = tagLocations([
      makeRawJob({ sourceJobId: "1", locationRaw: "Doha" }),
      makeRawJob({ sourceJobId: "2", locationRaw: "Doha, Qatar" }),
    ]);

    expect(result[0]?.locationTags).toEqual(["qatar"]);
    expect(result[1]?.locationTags).toEqual(["qatar"]);
  });

  it("tags a multi-country Gulf posting with every matching tag", () => {
    const [result] = tagLocations([makeRawJob({ locationRaw: "Dubai, UAE / Riyadh, KSA / Doha, Qatar" })]);

    expect(result?.locationTags).toEqual(["uae", "saudi", "qatar"]);
  });

  it("does not match the keywords inside other words", () => {
    const [result] = tagLocations([makeRawJob({ locationRaw: "Kansas City, USA (Dohanyi Ave, Saudiville)" })]);

    expect(result?.locationTags).toEqual([]);
  });
});
