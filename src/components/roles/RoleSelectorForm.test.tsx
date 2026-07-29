// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoleSelectorForm } from "./RoleSelectorForm";

const { confirmRoleSelectionAction, expandRoleAction } = vi.hoisted(() => ({
  confirmRoleSelectionAction: vi.fn(),
  expandRoleAction: vi.fn(),
}));

vi.mock("@/features/roles/actions", () => ({ confirmRoleSelectionAction, expandRoleAction }));

beforeEach(() => {
  expandRoleAction.mockReset();
  confirmRoleSelectionAction.mockReset();
  expandRoleAction.mockResolvedValue({
    ok: true,
    data: { relatedRoles: ["Backend Engineer", "Platform Engineer"], source: "seed" },
  });
});

describe("RoleSelectorForm", () => {
  it("expands the role when the user presses Enter in the input", async () => {
    const user = userEvent.setup();
    render(<RoleSelectorForm activeSelection={null} />);

    await user.type(screen.getByPlaceholderText("e.g. Full Stack Developer"), "Full Stack Developer{Enter}");

    expect(expandRoleAction).toHaveBeenCalledTimes(1);
    expect(expandRoleAction).toHaveBeenCalledWith("Full Stack Developer");
    expect(await screen.findByText("Platform Engineer")).toBeInTheDocument();
  });

  it("trims the role before sending it to the action", async () => {
    const user = userEvent.setup();
    render(<RoleSelectorForm activeSelection={null} />);

    await user.type(screen.getByPlaceholderText("e.g. Full Stack Developer"), "  Data Engineer  {Enter}");

    expect(expandRoleAction).toHaveBeenCalledWith("Data Engineer");
  });

  it("does not expand on Enter when the input is empty", async () => {
    const user = userEvent.setup();
    render(<RoleSelectorForm activeSelection={null} />);

    await user.type(screen.getByPlaceholderText("e.g. Full Stack Developer"), "{Enter}");

    expect(expandRoleAction).not.toHaveBeenCalled();
  });

  it("does not expand on Enter when the input is whitespace only", async () => {
    const user = userEvent.setup();
    render(<RoleSelectorForm activeSelection={null} />);

    await user.type(screen.getByPlaceholderText("e.g. Full Stack Developer"), "   {Enter}");

    expect(expandRoleAction).not.toHaveBeenCalled();
  });

  it("still expands when the Expand button is clicked", async () => {
    const user = userEvent.setup();
    render(<RoleSelectorForm activeSelection={null} />);

    await user.type(screen.getByPlaceholderText("e.g. Full Stack Developer"), "QA Engineer");
    await user.click(screen.getByRole("button", { name: "Expand" }));

    expect(expandRoleAction).toHaveBeenCalledTimes(1);
    expect(expandRoleAction).toHaveBeenCalledWith("QA Engineer");
  });

  it("surfaces the action error and renders no preview", async () => {
    expandRoleAction.mockResolvedValue({ ok: false, error: "Role map unavailable." });
    const user = userEvent.setup();
    render(<RoleSelectorForm activeSelection={null} />);

    await user.type(screen.getByPlaceholderText("e.g. Full Stack Developer"), "Astronaut{Enter}");

    expect(await screen.findByText("Role map unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("Related roles")).not.toBeInTheDocument();
  });
});
