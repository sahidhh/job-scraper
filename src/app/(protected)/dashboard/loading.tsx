// Route-level skeleton for /dashboard. Unlike analytics/ and settings/, these
// four routes have no nested layout.tsx, so the page heading is inside the
// Suspense boundary and has to be part of the skeleton -- otherwise the title
// pops in and shoves everything down on hydration.
//
// Shapes track DashboardPage: heading, stat-chip row, filter toolbar, jobs
// table. The table is drawn as a real frame with row lines rather than one
// grey slab so the swap lands on the same rhythm.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-14 w-[88px] animate-pulse rounded-lg border border-border bg-muted/50"
            />
          ))}
        </div>

        <div className="h-12 animate-pulse rounded-xl border border-border bg-muted/50" />

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="h-10 animate-pulse bg-muted/50" />
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
                <div className="hidden h-4 w-28 animate-pulse rounded bg-muted sm:block" />
                <div className="h-5 w-12 animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
