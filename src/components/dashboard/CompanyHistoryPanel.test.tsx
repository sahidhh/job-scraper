// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/shared/actionResult";
import type { JobWithScore } from "@/features/jobs/domain/types";

const getCompanyHistoryAction = vi.fn<() => Promise<ActionResult<JobWithScore[]>>>();
vi.mock("@/features/jobs/actions", () => ({
  getCompanyHistoryAction: () => getCompanyHistoryAction(),
}));

import { CompanyHistoryPanel } from "./CompanyHistoryPanel";
import { makeJob } from "./testJobFixture";

beforeEach(() => {
  getCompanyHistoryAction.mockReset();
});

describe("CompanyHistoryPanel", () => {
  it("shows the error when the lookup fails, not the empty state", async () => {
    getCompanyHistoryAction.mockResolvedValue({ ok: false, error: "Network unreachable" });
    render(<CompanyHistoryPanel companyName="Acme" />);

    expect(await screen.findByText(/Network unreachable/)).toBeInTheDocument();
    expect(screen.queryByText("No prior applications found.")).not.toBeInTheDocument();
  });

  it("shows the empty state when the lookup succeeds with no prior applications", async () => {
    getCompanyHistoryAction.mockResolvedValue({ ok: true, data: [makeJob()] });
    render(<CompanyHistoryPanel companyName="Acme" />);

    expect(await screen.findByText("No prior applications found.")).toBeInTheDocument();
  });

  it("lists every job the action returned without re-filtering by company", async () => {
    getCompanyHistoryAction.mockResolvedValue({
      ok: true,
      data: [
        makeJob({ id: "job-1", title: "Backend Engineer", companyName: "Acme Inc." }),
        makeJob({ id: "job-2", title: "Platform Engineer", companyName: "Acme" }),
      ],
    });
    render(<CompanyHistoryPanel companyName="Acme" />);

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Platform Engineer")).toBeInTheDocument();
  });
});
