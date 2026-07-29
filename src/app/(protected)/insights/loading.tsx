// Route-level skeleton for /insights. Heading is inside the boundary (no
// nested layout.tsx), then the two side-by-side skill cards -- the same two
// blocks InsightsPage's own Suspense fallback already draws, so the route
// skeleton and the streaming fallback agree instead of shifting.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-28 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/50" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/50" />
      </div>
    </div>
  );
}
