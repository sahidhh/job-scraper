import { cn } from "@/lib/utils";

// Logo mark + wordmark, per the design handoff: a near-black rounded square
// holding a bold white "J", wordmark immediately to its right. The product name
// is "Job Intelligence" -- the handoff's "Job Intel" is prototype shorthand and
// is deliberately not adopted (design/tech-stack.md §8).
export function Wordmark({ size = "desktop" }: { size?: "desktop" | "mobile" }) {
  const isMobile = size === "mobile";
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className={cn(
          "flex items-center justify-center rounded-md bg-foreground font-extrabold leading-none text-background",
          isMobile ? "size-5 text-[11px]" : "size-6 text-[13px]",
        )}
      >
        J
      </span>
      <span className="text-sm font-bold tracking-[-0.02em]">Job Intelligence</span>
    </span>
  );
}
