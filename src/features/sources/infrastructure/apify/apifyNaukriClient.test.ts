import { describe, expect, it, vi } from "vitest";
import { SourceAuthExpiredError, SourceBlockedError } from "@/features/sources/domain/errors";
import type { RawJob } from "@/features/sources/domain/types";
import {
  DEFAULT_ACTOR_ID,
  DEFAULT_MAX_COST_USD,
  DEFAULT_TIMEOUT_SECS,
  dedupeByCompanyAndTitle,
  getIstDayNumber,
  getIstDayOfWeek,
  getWorkweekSkipReason,
  parseKeywordList,
  parsePositiveInt,
  resolveApifyConfig,
  runApifyNaukriActor,
  selectRotatedKeywords,
  type ApifyNaukriRunInput,
} from "./apifyNaukriClient";

function makeRawJob(overrides: Partial<RawJob> = {}): RawJob {
  return {
    source: "naukri",
    sourceJobId: "job-1",
    companyId: null,
    companyName: "Benovymed",
    title: "Senior Backend Engineer",
    locationRaw: "Bengaluru",
    description: "Build APIs.",
    url: "https://example.com/1",
    postedAt: "2026-11-24T00:00:00.000Z",
    ...overrides,
  };
}

function makeInput(overrides: Partial<ApifyNaukriRunInput> = {}): ApifyNaukriRunInput {
  return {
    jobBoard: "naukri",
    keyword: "backend engineer",
    maxJobs: 20,
    experience: "3",
    freshness: "3",
    fetchDetails: true,
    ...overrides,
  };
}

describe("resolveApifyConfig", () => {
  it("returns null when APIFY_TOKEN is missing or whitespace", () => {
    expect(resolveApifyConfig({})).toBeNull();
    expect(resolveApifyConfig({ APIFY_TOKEN: "   " })).toBeNull();
  });

  it("uses defaults when optional env vars are missing or invalid", () => {
    expect(
      resolveApifyConfig({
        APIFY_TOKEN: " tok_123 ",
        APIFY_MAX_COST_PER_RUN_USD: "-1",
        APIFY_TIMEOUT_SECS: "abc",
      }),
    ).toEqual({
      token: "tok_123",
      actorId: DEFAULT_ACTOR_ID,
      maxCostUsd: DEFAULT_MAX_COST_USD,
      timeoutSecs: DEFAULT_TIMEOUT_SECS,
    });
  });

  it("reads custom actorId, maxCostUsd, and timeoutSecs", () => {
    expect(
      resolveApifyConfig({
        APIFY_TOKEN: "tok_123",
        APIFY_NAUKRI_ACTOR_ID: "custom~actor",
        APIFY_MAX_COST_PER_RUN_USD: "0.25",
        APIFY_TIMEOUT_SECS: "90",
      }),
    ).toEqual({
      token: "tok_123",
      actorId: "custom~actor",
      maxCostUsd: 0.25,
      timeoutSecs: 90,
    });
  });
});

describe("IST helpers and getWorkweekSkipReason", () => {
  // 2026-11-20T19:00:00Z = Saturday 2026-11-21T00:30:00 IST (day 6)
  const saturdayEarlyIst = new Date("2026-11-20T19:00:00.000Z");
  // 2026-11-22T06:00:00Z = Sunday 2026-11-22T11:30:00 IST (day 0)
  const sundayIst = new Date("2026-11-22T06:00:00.000Z");
  // 2026-11-23T06:00:00Z = Monday 2026-11-23T11:30:00 IST (day 1)
  const mondayIst = new Date("2026-11-23T06:00:00.000Z");
  // 2026-11-27T06:00:00Z = Friday 2026-11-27T11:30:00 IST (day 5)
  const fridayIst = new Date("2026-11-27T06:00:00.000Z");

  it("computes IST day of week across UTC midnight boundary", () => {
    expect(getIstDayOfWeek(saturdayEarlyIst)).toBe(6);
    expect(getIstDayOfWeek(sundayIst)).toBe(0);
    expect(getIstDayOfWeek(mondayIst)).toBe(1);
    expect(getIstDayOfWeek(fridayIst)).toBe(5);
  });

  it("gates India (naukri) to Mon-Fri IST and GCC (naukrigulf) to Sun-Fri IST", () => {
    const env = { APIFY_TOKEN: "tok_123" };

    expect(getWorkweekSkipReason("naukri", saturdayEarlyIst, env)).toBe("off-day for India (Sat/Sun IST)");
    expect(getWorkweekSkipReason("naukri", sundayIst, env)).toBe("off-day for India (Sat/Sun IST)");
    expect(getWorkweekSkipReason("naukri", mondayIst, env)).toBeNull();
    expect(getWorkweekSkipReason("naukri", fridayIst, env)).toBeNull();

    expect(getWorkweekSkipReason("naukrigulf", saturdayEarlyIst, env)).toBe("off-day for GCC (Sat IST)");
    expect(getWorkweekSkipReason("naukrigulf", sundayIst, env)).toBeNull();
    expect(getWorkweekSkipReason("naukrigulf", mondayIst, env)).toBeNull();
    expect(getWorkweekSkipReason("naukrigulf", fridayIst, env)).toBeNull();
  });

  it("skips when APIFY_TOKEN is missing unless force flag is enabled", () => {
    expect(getWorkweekSkipReason("naukri", mondayIst, {})).toBe("APIFY_TOKEN not configured");
    expect(getWorkweekSkipReason("naukrigulf", sundayIst, {})).toBe("APIFY_TOKEN not configured");

    expect(getWorkweekSkipReason("naukri", saturdayEarlyIst, { NAUKRI_FORCE_RUN: "true" })).toBeNull();
    expect(getWorkweekSkipReason("naukri", sundayIst, { NAUKRI_FORCE_RUN: "1" })).toBeNull();
    expect(getWorkweekSkipReason("naukrigulf", saturdayEarlyIst, { NAUKRIGULF_FORCE_RUN: "true" })).toBeNull();
    expect(getWorkweekSkipReason("naukrigulf", saturdayEarlyIst, { NAUKRIGULF_FORCE_RUN: "1" })).toBeNull();
  });
});

describe("selectRotatedKeywords", () => {
  it("rotates cleanly across consecutive IST days and wraps around", () => {
    const keywords = ["backend", "nodejs", "typescript", "golang"];
    const day0 = new Date("2026-11-23T06:00:00.000Z"); // IST day N
    const day1 = new Date("2026-11-24T06:00:00.000Z"); // IST day N + 1
    const day2 = new Date("2026-11-25T06:00:00.000Z"); // IST day N + 2

    expect(getIstDayNumber(day1)).toBe(getIstDayNumber(day0) + 1);

    const pick0 = selectRotatedKeywords(keywords, 2, day0);
    const pick1 = selectRotatedKeywords(keywords, 2, day1);
    const pick2 = selectRotatedKeywords(keywords, 2, day2);

    expect(pick0).toHaveLength(2);
    expect(pick1).toHaveLength(2);
    expect(new Set([...pick0, ...pick1])).toEqual(new Set(keywords));
    expect(pick2).toEqual(pick0);
  });

  it("dedupes and trims keywords, and handles empty or full-size perRun", () => {
    expect(selectRotatedKeywords(["", "  "], 2)).toEqual([]);
    expect(selectRotatedKeywords([" backend ", "backend", "node"], 5)).toEqual(["backend", "node"]);
    expect(selectRotatedKeywords(["a", "b", "c"], 0)).toEqual(["a", "b", "c"]);
  });
});

describe("parseKeywordList and parsePositiveInt", () => {
  it("parses comma-separated keywords and falls back when empty", () => {
    expect(parseKeywordList(" node , , react ", ["fallback"])).toEqual(["node", "react"]);
    expect(parseKeywordList(" , ", ["fallback"])).toEqual(["fallback"]);
    expect(parseKeywordList(undefined, ["fallback"])).toEqual(["fallback"]);
  });

  it("parses positive integers and falls back otherwise", () => {
    expect(parsePositiveInt("42", 10)).toBe(42);
    expect(parsePositiveInt("0", 10)).toBe(10);
    expect(parsePositiveInt("-3", 10)).toBe(10);
    expect(parsePositiveInt("nope", 10)).toBe(10);
    expect(parsePositiveInt(undefined, 10)).toBe(10);
  });
});

describe("dedupeByCompanyAndTitle", () => {
  it("dedupes by sourceJobId and collapses city-spam reposts while preferring Remote in place", () => {
    const jobs: RawJob[] = [
      makeRawJob({ sourceJobId: "1", companyName: "Benovymed", title: "Software Engineer!", locationRaw: "Delhi" }),
      makeRawJob({ sourceJobId: "1", companyName: "Benovymed", title: "Software Engineer!", locationRaw: "Remote" }),
      makeRawJob({ sourceJobId: "2", companyName: "Acme", title: "Platform Engineer", locationRaw: "Mumbai" }),
      makeRawJob({ sourceJobId: "3", companyName: "benovymed ", title: "software  engineer", locationRaw: "Pune" }),
      makeRawJob({ sourceJobId: "4", companyName: "Benovymed", title: "Software Engineer", locationRaw: "Remote - India" }),
      makeRawJob({ sourceJobId: "5", companyName: "Benovymed", title: "Software Engineer", locationRaw: "Hyderabad" }),
    ];

    const deduped = dedupeByCompanyAndTitle(jobs);

    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.sourceJobId).toBe("4");
    expect(deduped[0]?.locationRaw).toBe("Remote - India");
    expect(deduped[1]?.sourceJobId).toBe("2");
  });

  it("does not collapse jobs when companyName or title is empty", () => {
    const jobs: RawJob[] = [
      makeRawJob({ sourceJobId: "1", companyName: "", title: "Engineer", locationRaw: "Delhi" }),
      makeRawJob({ sourceJobId: "2", companyName: "", title: "Engineer", locationRaw: "Mumbai" }),
    ];

    expect(dedupeByCompanyAndTitle(jobs)).toHaveLength(2);
  });
});

describe("runApifyNaukriActor", () => {
  it("throws SourceAuthExpiredError when APIFY_TOKEN is missing", async () => {
    const fetchFn = vi.fn();
    await expect(runApifyNaukriActor(makeInput(), { env: {}, fetchFn: fetchFn as unknown as typeof fetch })).rejects.toThrow(
      SourceAuthExpiredError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sends Bearer auth header (not URL token), maxTotalChargeUsd, timeout, and returns dataset array", async () => {
    const items = [{ id: "1" }, { id: "2" }];
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(items),
    });

    const input = makeInput({ jobBoard: "naukrigulf", walkin: false });
    const result = await runApifyNaukriActor(input, {
      env: {
        APIFY_TOKEN: "secret_token_value",
        APIFY_NAUKRI_ACTOR_ID: "owner~actor",
        APIFY_MAX_COST_PER_RUN_USD: "0.05",
        APIFY_TIMEOUT_SECS: "90",
      },
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(result).toEqual(items);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.apify.com/v2/acts/owner~actor/run-sync-get-dataset-items?maxTotalChargeUsd=0.05&timeout=90",
    );
    expect(url).not.toContain("secret_token_value");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer secret_token_value",
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    expect(init.body).toBe(JSON.stringify(input));
  });

  it("maps 401/403 to SourceAuthExpiredError and 402/429/500/non-array to SourceBlockedError", async () => {
    const env = { APIFY_TOKEN: "tok_123" };

    for (const status of [401, 403]) {
      const fetchFn = vi.fn().mockResolvedValue({ ok: false, status, json: vi.fn() });
      await expect(
        runApifyNaukriActor(makeInput(), { env, fetchFn: fetchFn as unknown as typeof fetch }),
      ).rejects.toThrow(SourceAuthExpiredError);
    }

    for (const [status, msgPart] of [
      [402, "monthly credit limit"],
      [429, "rate limit"],
      [500, "HTTP 500"],
    ] as const) {
      const fetchFn = vi.fn().mockResolvedValue({ ok: false, status, json: vi.fn() });
      await expect(
        runApifyNaukriActor(makeInput(), { env, fetchFn: fetchFn as unknown as typeof fetch }),
      ).rejects.toThrow(expect.objectContaining({ name: SourceBlockedError.name, message: expect.stringContaining(msgPart) }));
    }

    const nonArrayFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ error: "unexpected" }),
    });
    await expect(
      runApifyNaukriActor(makeInput(), { env, fetchFn: nonArrayFetch as unknown as typeof fetch }),
    ).rejects.toThrow(SourceBlockedError);
  });
});
