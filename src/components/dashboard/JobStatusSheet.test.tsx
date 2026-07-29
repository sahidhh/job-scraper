// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/shared/actionResult";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const setJobStatusAction = vi.fn<() => Promise<ActionResult>>(async () => ({ ok: true, data: undefined }));
vi.mock("@/features/jobs/actions", () => ({
  setJobStatusAction: () => setJobStatusAction(),
}));

import { JobStatusSheet } from "./JobStatusSheet";
import { TEST_STATUSES } from "./testJobFixture";

function renderSheet() {
  return render(<JobStatusSheet jobId="job-1" statusId="status-new" statuses={TEST_STATUSES} />);
}

beforeEach(() => {
  setJobStatusAction.mockReset();
  setJobStatusAction.mockResolvedValue({ ok: true, data: undefined });
  refresh.mockClear();
});

describe("JobStatusSheet", () => {
  it("closes the sheet and shows the new status immediately", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.click(await screen.findByRole("button", { name: /Rejected/ }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Rejected" })).toBeInTheDocument();
    expect(setJobStatusAction).toHaveBeenCalledTimes(1);
  });

  it("rolls the status back when the action fails", async () => {
    const user = userEvent.setup();
    setJobStatusAction.mockResolvedValue({ ok: false, error: "nope" });
    renderSheet();

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.click(await screen.findByRole("button", { name: /Rejected/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Rejected" })).not.toBeInTheDocument();
  });
});
