import { describe, expect, it } from "vitest";
import { JOB_SOURCES } from "@/shared/domain/enums";
import { sourceScrapers } from "./registry";

describe("sourceScrapers registry", () => {
  it("registers exactly one scraper per supported source", () => {
    const sources = sourceScrapers.map((scraper) => scraper.source);
    expect(new Set(sources)).toEqual(new Set(JOB_SOURCES));
    expect(sources).toHaveLength(JOB_SOURCES.length);
  });

  it("marks greenhouse/lever/ashby as requiring company config and the rest as not", () => {
    const withCompanyConfig = sourceScrapers.filter((s) => s.requiresCompanyConfig).map((s) => s.source);
    const withoutCompanyConfig = sourceScrapers.filter((s) => !s.requiresCompanyConfig).map((s) => s.source);

    expect(new Set(withCompanyConfig)).toEqual(new Set(["greenhouse", "lever", "ashby"]));
    expect(new Set(withoutCompanyConfig)).toEqual(new Set(["wellfound", "remoteok", "mycareersfuture"]));
  });
});
