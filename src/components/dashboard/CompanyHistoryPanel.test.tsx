// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/shared/actionResult";
import type { CompanyHistoryPage } from "@/features/jobs/domain/types";

const getCompanyHistoryAction = vi.fn<(companyName: string, offset?: number) => Promise<ActionResult<CompanyHistoryPage>>>();
vi.mock("@/features/jobs/actions", () => ({
  getCompanyHistoryAction: (companyName: string, offset?: number) => getCompanyHistoryAction(companyName, offset),
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
    getCompanyHistoryAction.mockResolvedValue({ ok: true, data: { jobs: [makeJob()], hasMore: false } });
    render(<CompanyHistoryPanel companyName="Acme" />);

    expect(await screen.findByText("No prior applications found.")).toBeInTheDocument();
  });

  it("lists every job the action returned without re-filtering by company", async () => {
    getCompanyHistoryAction.mockResolvedValue({
      ok: true,
      data: {
        jobs: [
          makeJob({ id: "job-1", title: "Backend Engineer", companyName: "Acme Inc." }),
          makeJob({ id: "job-2", title: "Platform Engineer", companyName: "Acme" }),
        ],
        hasMore: false,
      },
    });
    render(<CompanyHistoryPanel companyName="Acme" />);

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Platform Engineer")).toBeInTheDocument();
  });

  it("hides the Load more button when the first page is the only page", async () => {
    getCompanyHistoryAction.mockResolvedValue({
      ok: true,
      data: {
        jobs: [makeJob({ id: "job-1", title: "Backend Engineer" }), makeJob({ id: "job-2", title: "Platform Engineer" })],
        hasMore: false,
      },
    });
    render(<CompanyHistoryPanel companyName="Acme" />);

    await screen.findByText("Backend Engineer");
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("fetches the next page at the current offset and appends it on Load more", async () => {
    getCompanyHistoryAction.mockResolvedValueOnce({
      ok: true,
      data: { jobs: [makeJob({ id: "job-1", title: "Backend Engineer" })], hasMore: true },
    });
    getCompanyHistoryAction.mockResolvedValueOnce({
      ok: true,
      data: { jobs: [makeJob({ id: "job-2", title: "Platform Engineer" })], hasMore: false },
    });
    render(<CompanyHistoryPanel companyName="Acme" />);

    const loadMore = await screen.findByRole("button", { name: /load more/i });
    await userEvent.click(loadMore);

    expect(await screen.findByText("Platform Engineer")).toBeInTheDocument();
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    expect(getCompanyHistoryAction).toHaveBeenLastCalledWith("Acme", 1);
    await waitFor(() => expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument());
  });
});
