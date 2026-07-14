import { afterEach, describe, expect, it, vi } from "vitest";
import type { CareersPageExtractor, ExtractedCareersJob } from "@/features/sources/domain/CareersPageExtractor";
import { fetchCareersUrlJobs } from "./CareersUrlScraper";

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "Content-Type": "text/html" } });
}

function fakeExtractor(jobs: ExtractedCareersJob[]): CareersPageExtractor {
  return { extract: vi.fn().mockResolvedValue(jobs) };
}

describe("fetchCareersUrlJobs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps extracted jobs to RawJob, deriving companyName from the page domain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("<p>Backend Engineer - Remote</p>")));
    const extractor = fakeExtractor([
      { title: "Backend Engineer", location: "Remote", description: "Build APIs.", url: "https://acme.com/jobs/1" },
    ]);

    const result = await fetchCareersUrlJobs("https://acme.com/careers", [], { extractor });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: "careers_url",
      companyId: null,
      companyName: "acme.com",
      title: "Backend Engineer",
      locationRaw: "Remote",
      description: "Build APIs.",
      url: "https://acme.com/jobs/1",
      postedAt: null,
    });
    expect(result[0]?.sourceJobId).toMatch(/^[0-9a-f]{24}$/);
  });

  it("falls back to the page URL when an extracted job has no url", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("<p>Engineer</p>")));
    const extractor = fakeExtractor([{ title: "Engineer", location: "", description: "", url: "" }]);

    const result = await fetchCareersUrlJobs("https://acme.com/careers", [], { extractor });

    expect(result[0]?.url).toBe("https://acme.com/careers");
  });

  it("produces a stable, deterministic sourceJobId for the same url+title", async () => {
    // Each call must return a fresh Response — a consumed body is not reusable.
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(htmlResponse("<p>Engineer</p>"))));
    const extractor = fakeExtractor([
      { title: "Engineer", location: "", description: "", url: "https://acme.com/jobs/1" },
    ]);

    const first = await fetchCareersUrlJobs("https://acme.com/careers", [], { extractor });
    const second = await fetchCareersUrlJobs("https://acme.com/careers", [], { extractor });

    expect(first[0]?.sourceJobId).toBe(second[0]?.sourceJobId);
  });

  it("skips extracted items with an empty title", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("<p>text</p>")));
    const extractor = fakeExtractor([{ title: "", location: "", description: "", url: "" }]);

    const result = await fetchCareersUrlJobs("https://acme.com/careers", [], { extractor });

    expect(result).toEqual([]);
  });

  it("dedupes extracted items that resolve to the same synthetic id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("<p>text</p>")));
    const extractor = fakeExtractor([
      { title: "Engineer", location: "Remote", description: "A", url: "https://acme.com/jobs/1" },
      { title: "Engineer", location: "Onsite", description: "B", url: "https://acme.com/jobs/1" },
    ]);

    const result = await fetchCareersUrlJobs("https://acme.com/careers", [], { extractor });

    expect(result).toHaveLength(1);
  });

  it("filters extracted jobs by the given roles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("<p>text</p>")));
    const extractor = fakeExtractor([
      { title: "Backend Engineer", location: "", description: "", url: "https://acme.com/jobs/1" },
      { title: "Sales Manager", location: "", description: "", url: "https://acme.com/jobs/2" },
    ]);

    const result = await fetchCareersUrlJobs("https://acme.com/careers", ["Backend Engineer"], { extractor });

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Backend Engineer");
  });

  it("strips script/style content from the fetched HTML before extraction", async () => {
    const html = "<style>.a{color:red}</style><script>evil()</script><p>Real job listing</p>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse(html)));
    const extractor = fakeExtractor([]);

    await fetchCareersUrlJobs("https://acme.com/careers", [], { extractor });

    expect(extractor.extract).toHaveBeenCalledWith("https://acme.com/careers", "Real job listing");
  });

  it("returns [] without calling the extractor when the page text is empty after stripping", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("<script>only script</script>")));
    const extractor = fakeExtractor([]);

    const result = await fetchCareersUrlJobs("https://acme.com/careers", [], { extractor });

    expect(result).toEqual([]);
    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it("throws when the page fetch returns a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("not found", 404)));
    const extractor = fakeExtractor([]);

    await expect(fetchCareersUrlJobs("https://acme.com/careers", [], { extractor })).rejects.toThrow(
      "careers page fetch returned 404",
    );
  });
});
