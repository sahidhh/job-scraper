// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "./FilterBar";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

// Read lazily inside the mocked hook so each test can swap the URL state
// before rendering.
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("./DashboardNavigationProvider", () => ({
  useDashboardNavigation: () => ({ isPending: false, navigate }),
}));

function renderFilterBar(query = "") {
  searchParams = new URLSearchParams(query);
  render(<FilterBar hasAiScores statuses={[]} effectiveMaxYears={null} />);
}

beforeEach(() => {
  navigate.mockClear();
});

// The mobile sheet and the desktop toolbar are two separate JSX trees in the
// same component; only the desktop one is mounted until the sheet is opened.
describe("FilterBar desktop toolbar", () => {
  it("commits the search term when the user presses Enter", async () => {
    const user = userEvent.setup();
    renderFilterBar();

    await user.type(screen.getByPlaceholderText("Search title or company"), "staff engineer{Enter}");

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/dashboard?q=staff+engineer");
  });

  it("commits only once when Enter is followed by a blur", async () => {
    const user = userEvent.setup();
    renderFilterBar();
    const input = screen.getByPlaceholderText("Search title or company");

    await user.type(input, "remote{Enter}");
    await user.tab();

    expect(input).not.toHaveFocus();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/dashboard?q=remote");
  });

  it("still commits on blur alone, with no Enter", async () => {
    const user = userEvent.setup();
    renderFilterBar();

    await user.type(screen.getByPlaceholderText("Search title or company"), "remote");
    await user.tab();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/dashboard?q=remote");
  });

  it("does not navigate when a field is blurred without being changed", async () => {
    const user = userEvent.setup();
    renderFilterBar("q=remote");

    await user.click(screen.getByPlaceholderText("Search title or company"));
    await user.tab();

    expect(navigate).not.toHaveBeenCalled();
  });

  it("drops the q param when the search field is cleared and submitted", async () => {
    const user = userEvent.setup();
    renderFilterBar("q=remote&location=Dubai");

    await user.clear(screen.getByPlaceholderText("Search title or company"));
    await user.keyboard("{Enter}");

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/dashboard?location=Dubai");
  });

  it("commits the min-score field on Enter as a 0-1 decimal", async () => {
    const user = userEvent.setup();
    renderFilterBar();

    await user.type(screen.getByPlaceholderText("Min score"), "75{Enter}");

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/dashboard?minScore=0.75");
  });

  it("commits the max-years field on Enter", async () => {
    const user = userEvent.setup();
    renderFilterBar();

    await user.type(screen.getByPlaceholderText("Max yrs"), "3{Enter}");

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/dashboard?maxYears=3");
  });
});

describe("FilterBar mobile sheet", () => {
  async function openSheet(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /filters/i }));
  }

  it("commits the search term when the user presses Enter", async () => {
    const user = userEvent.setup();
    renderFilterBar();
    await openSheet(user);

    await user.type(await screen.findByPlaceholderText("Title or company"), "designer{Enter}");

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/dashboard?q=designer");
  });

  it("commits the min-score field on Enter", async () => {
    const user = userEvent.setup();
    renderFilterBar();
    await openSheet(user);

    await user.type(await screen.findByPlaceholderText("e.g. 75"), "60{Enter}");

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/dashboard?minScore=0.6");
  });

  it("commits the max-years field on Enter", async () => {
    const user = userEvent.setup();
    renderFilterBar();
    await openSheet(user);

    await user.type(await screen.findByPlaceholderText("No limit"), "5{Enter}");

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/dashboard?maxYears=5");
  });
});
