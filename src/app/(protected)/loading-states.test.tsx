// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardLoading from "@/app/(protected)/dashboard/loading";
import InsightsLoading from "@/app/(protected)/insights/loading";
import ResumeLoading from "@/app/(protected)/resume/loading";
import RolesLoading from "@/app/(protected)/roles/loading";

// Route-level loading UI is static markup, so these are smoke tests: they
// guard that each route actually HAS a skeleton (the audit finding was that
// four routes had none) and that it uses the shared animate-pulse /
// border-border / bg-muted vocabulary rather than drifting into its own.
const ROUTES = [
  ["/dashboard", DashboardLoading],
  ["/roles", RolesLoading],
  ["/resume", ResumeLoading],
  ["/insights", InsightsLoading],
] as const;

describe("route loading skeletons", () => {
  it.each(ROUTES)("%s renders a pulsing skeleton", (_route, Loading) => {
    const { container } = render(<Loading />);

    const pulsing = container.querySelectorAll(".animate-pulse");
    expect(pulsing.length).toBeGreaterThan(0);
  });

  it.each(ROUTES)("%s leads with a page-heading placeholder", (_route, Loading) => {
    // These four routes have no nested layout.tsx, so the h1 is inside the
    // Suspense boundary and the skeleton must reserve room for it.
    const { container } = render(<Loading />);

    expect(container.querySelector(".h-7.animate-pulse")).not.toBeNull();
  });

  it.each(ROUTES)("%s uses only design-token surfaces", (_route, Loading) => {
    const { container } = render(<Loading />);

    for (const el of container.querySelectorAll<HTMLElement>("[class]")) {
      expect(el.className).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|oklch\(/i);
    }
    for (const el of container.querySelectorAll<HTMLElement>(".animate-pulse")) {
      expect(el.className).toMatch(/bg-muted/);
    }
  });

  it.each(ROUTES)("%s renders no interactive elements", (_route, Loading) => {
    // A skeleton that ships focusable nodes steals tab stops from the real
    // page the moment it swaps in.
    const { container } = render(<Loading />);

    expect(container.querySelectorAll("a, button, input, select, textarea")).toHaveLength(0);
  });
});
