export default function Loading() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 2 }).map((_, section) => (
        <div key={section} className="space-y-3">
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/50" />
            <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/50" />
          </div>
        </div>
      ))}
    </div>
  );
}
