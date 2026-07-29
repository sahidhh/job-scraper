// Route-level skeleton for /roles. Tracks RolesPage: the max-w-2xl column,
// heading, the "Role Packs" label plus its two-up card grid, the "or enter a
// custom role" divider (drawn for real -- it is a hairline, not a loading
// surface), and the custom-role input/button row.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-44 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3 w-64 max-w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-xl border border-border bg-muted/50"
            />
          ))}
        </div>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-2">
            <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="h-9 flex-1 animate-pulse rounded-md border border-border bg-muted/50" />
        <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}
