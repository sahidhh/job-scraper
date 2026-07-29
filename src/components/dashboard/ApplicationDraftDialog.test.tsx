// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "@/features/applications/domain/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const getApplicationForJobAction = vi.fn();
const markApplicationSentAction = vi.fn();
const draftApplicationAction = vi.fn();
const markApplicationDismissedAction = vi.fn();
const updateApplicationContentAction = vi.fn();

vi.mock("@/features/applications/actions", () => ({
  getApplicationForJobAction: (...args: unknown[]) => getApplicationForJobAction(...args),
  markApplicationSentAction: (...args: unknown[]) => markApplicationSentAction(...args),
  draftApplicationAction: (...args: unknown[]) => draftApplicationAction(...args),
  markApplicationDismissedAction: (...args: unknown[]) => markApplicationDismissedAction(...args),
  updateApplicationContentAction: (...args: unknown[]) => updateApplicationContentAction(...args),
}));

const { ApplicationDraftDialog } = await import("./ApplicationDraftDialog");

const DRAFT: Application = {
  id: "app-1",
  jobId: "job-1",
  resumeId: "resume-1",
  kind: "email",
  subject: "Application for Senior Engineer",
  body: "Hello,\n\nI would like to apply.",
  recipientEmail: "talent@example.com",
  status: "draft",
  model: "test-model",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  sentAt: null,
};

// jsdom has no navigator, and clicking a real mailto: anchor makes it log
// "Not implemented: navigation". The component deliberately does NOT
// preventDefault on the happy path (the mailto hand-off is the whole point),
// so swallow the default at the document level instead. This runs after the
// component's own handler, so it never masks what is under test.
beforeAll(() => {
  document.addEventListener("click", (event) => event.preventDefault());
});

// React 19 entangles in-flight async transitions, so a transition left hanging
// at the end of a test keeps the *next* test's transitions stuck pending. Hold
// every deliberately-slow action here and release it during teardown.
let release: (() => void) | null = null;

function heldOpen(): Promise<{ ok: false; error: string }> {
  return new Promise((resolve) => {
    release = () => resolve({ ok: false, error: "released at teardown" });
  });
}

beforeEach(() => {
  getApplicationForJobAction.mockResolvedValue({ ok: true, data: DRAFT });
});

afterEach(async () => {
  release?.();
  release = null;
  await Promise.resolve();
  vi.clearAllMocks();
});

async function openDialog() {
  render(<ApplicationDraftDialog jobId="job-1" jobTitle="Senior Engineer" />);
  fireEvent.click(screen.getByRole("button", { name: /draft application for senior engineer/i }));
  const link = await screen.findByRole("link", { name: /open in mail client/i });
  // The initial fetch runs in its own transition, so the link mounts inert and
  // only becomes live once that transition settles. Wait it out.
  await waitFor(() => expect(link).not.toHaveAttribute("aria-disabled"));
  return link;
}

describe("ApplicationDraftDialog mail hand-off", () => {
  it("renders the mailto hand-off as a live link when idle", async () => {
    const link = await openDialog();

    expect(link).toHaveAttribute("href", expect.stringContaining("mailto:talent%40example.com"));
    expect(link).not.toHaveAttribute("aria-disabled");
    expect(link).not.toHaveAttribute("tabindex", "-1");
  });

  it("marks the application sent once and goes inert while the transition is pending", async () => {
    // Never resolves during the test -- the transition stays pending, which is
    // exactly the window in which the old `disabled` prop did nothing.
    markApplicationSentAction.mockReturnValue(heldOpen());

    const link = await openDialog();

    fireEvent.click(link);
    await waitFor(() => expect(link).toHaveAttribute("aria-disabled", "true"));
    expect(markApplicationSentAction).toHaveBeenCalledTimes(1);
    expect(markApplicationSentAction).toHaveBeenCalledWith("app-1");

    expect(link).toHaveAttribute("tabindex", "-1");

    // A second click mid-flight must not fire the action again.
    fireEvent.click(link);
    fireEvent.click(link);
    expect(markApplicationSentAction).toHaveBeenCalledTimes(1);
  });

  it("cancels the mailto navigation while pending so the mail client is not reopened", async () => {
    markApplicationSentAction.mockReturnValue(heldOpen());

    const link = await openDialog();

    fireEvent.click(link);
    await waitFor(() => expect(link).toHaveAttribute("aria-disabled", "true"));

    const pendingClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(pendingClick);
    expect(pendingClick.defaultPrevented).toBe(true);
  });

  it("re-enables the link once the action settles", async () => {
    markApplicationSentAction.mockResolvedValue({ ok: false, error: "Could not mark sent" });

    const link = await openDialog();

    fireEvent.click(link);
    await screen.findByText("Could not mark sent");
    await waitFor(() => expect(link).not.toHaveAttribute("aria-disabled"));

    fireEvent.click(link);
    await waitFor(() => expect(markApplicationSentAction).toHaveBeenCalledTimes(2));
  });
});
