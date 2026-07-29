// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const setJobStatusAction = vi.fn(async () => ({ ok: true as const, data: undefined }));
vi.mock("@/features/jobs/actions", () => ({
  setJobStatusAction: (...args: unknown[]) => setJobStatusAction(...(args as [])),
  getCompanyHistoryAction: vi.fn(async () => ({ ok: true as const, data: { jobs: [], hasMore: false } })),
}));

vi.mock("@/features/applications/actions", () => ({
  draftApplicationAction: vi.fn(),
  getApplicationForJobAction: vi.fn(async () => ({ ok: true as const, data: null })),
  markApplicationDismissedAction: vi.fn(),
  markApplicationSentAction: vi.fn(),
  updateApplicationContentAction: vi.fn(),
}));

import { DashboardNavigationProvider } from "./DashboardNavigationProvider";
import { JobsTable } from "./JobsTable";
import { TEST_STATUSES, makeJob } from "./testJobFixture";

const jobs = [
  makeJob({ id: "job-1", title: "Backend Engineer" }),
  makeJob({ id: "job-2", title: "Platform Engineer" }),
  makeJob({ id: "job-3", title: "Data Engineer" }),
];

function renderTable(list = jobs) {
  return render(
    <DashboardNavigationProvider>
      <input aria-label="Search jobs" />
      <JobsTable jobs={list} statuses={TEST_STATUSES} />
    </DashboardNavigationProvider>,
  );
}

/** The focusable rows of the desktop table, in render order. */
function tableRows(container: HTMLElement): HTMLTableRowElement[] {
  return [...container.querySelectorAll<HTMLTableRowElement>("tbody tr[tabindex]")];
}

beforeEach(() => {
  setJobStatusAction.mockClear();
  refresh.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JobsTable keyboard shortcuts", () => {
  it("registers exactly one keydown listener no matter how many rows render", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    renderTable();

    const keydownRegistrations = addEventListener.mock.calls.filter(([type]) => type === "keydown");
    expect(jobs.length).toBeGreaterThan(1);
    expect(keydownRegistrations).toHaveLength(1);
  });

  it("removes its listener on unmount", () => {
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderTable();
    unmount();

    expect(removeEventListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
  });

  it("fires reject once, for the focused row only", async () => {
    const user = userEvent.setup();
    const { container } = renderTable();

    tableRows(container)[1]?.focus();
    await user.keyboard("r");

    await waitFor(() => expect(setJobStatusAction).toHaveBeenCalledTimes(1));
    expect(setJobStatusAction).toHaveBeenCalledWith(["job-2"], "status-rejected");
  });

  it("fires archive for the focused row", async () => {
    const user = userEvent.setup();
    const { container } = renderTable();

    tableRows(container)[0]?.focus();
    await user.keyboard("a");

    await waitFor(() => expect(setJobStatusAction).toHaveBeenCalledTimes(1));
    expect(setJobStatusAction).toHaveBeenCalledWith(["job-1"], "status-archived");
  });

  it("does not fire while a text input has focus", async () => {
    const user = userEvent.setup();
    const { container } = renderTable();

    // Land on a row first, so the only thing stopping the shortcut is that
    // the keystroke came from the search box.
    tableRows(container)[0]?.focus();
    screen.getByLabelText("Search jobs").focus();
    await user.keyboard("reject remote");

    expect(setJobStatusAction).not.toHaveBeenCalled();
  });

  it("does not fire when a modifier is held", async () => {
    const user = userEvent.setup();
    const { container } = renderTable();

    tableRows(container)[0]?.focus();
    await user.keyboard("{Control>}r{/Control}");
    await user.keyboard("{Meta>}a{/Meta}");

    expect(setJobStatusAction).not.toHaveBeenCalled();
  });

  it("does not fire when no row has focus", async () => {
    const user = userEvent.setup();
    renderTable();

    document.body.focus();
    await user.keyboard("r");

    expect(setJobStatusAction).not.toHaveBeenCalled();
  });

  it("moves focus between rows with the arrow keys", async () => {
    const user = userEvent.setup();
    const { container } = renderTable();
    const rows = tableRows(container);

    rows[0]?.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rows[1]);

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rows[2]);

    // Clamped at the last row rather than wrapping.
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rows[2]);

    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(rows[1]);
  });

  it("keeps exactly one row in the tab order", async () => {
    const user = userEvent.setup();
    const { container } = renderTable();
    const rows = tableRows(container);

    expect(rows.filter((row) => row.tabIndex === 0)).toHaveLength(1);
    expect(rows[0]?.tabIndex).toBe(0);

    rows[0]?.focus();
    await user.keyboard("{ArrowDown}");

    expect(tableRows(container).filter((row) => row.tabIndex === 0)).toHaveLength(1);
    expect(tableRows(container)[1]?.tabIndex).toBe(0);
  });

  it("toggles the focused row's detail panel with d", async () => {
    const user = userEvent.setup();
    const { container } = renderTable();

    tableRows(container)[0]?.focus();
    await user.keyboard("d");

    const expander = screen.getAllByRole("button", { name: "Backend Engineer" })[0];
    expect(expander).toHaveAttribute("aria-expanded", "true");
    expect(setJobStatusAction).not.toHaveBeenCalled();

    await user.keyboard("d");
    expect(expander).toHaveAttribute("aria-expanded", "false");
  });
});

describe("JobsTable shortcut legend", () => {
  it("advertises the shortcuts next to the table", () => {
    renderTable();

    const legend = document.getElementById("jobs-hotkey-legend");
    expect(legend).not.toBeNull();
    expect(legend).toHaveTextContent("move between rows");
    expect(legend).toHaveTextContent("R");
    expect(legend).toHaveTextContent("reject");
    expect(legend).toHaveTextContent("A");
    expect(legend).toHaveTextContent("archive");
    expect(legend).toHaveTextContent("D");
    expect(legend).toHaveTextContent("details");
  });

  it("hides the legend when there is nothing to act on", () => {
    renderTable([]);

    expect(document.getElementById("jobs-hotkey-legend")).toBeNull();
    expect(screen.getAllByText("No jobs match the current filters.").length).toBeGreaterThan(0);
  });
});
