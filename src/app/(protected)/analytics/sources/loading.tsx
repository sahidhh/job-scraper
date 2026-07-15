export default function Loading() {
  return (
    <div className="space-y-3">
      <div className="h-3 w-28 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-48 animate-pulse rounded-xl border border-border bg-muted/50" />
        <div className="h-48 animate-pulse rounded-xl border border-border bg-muted/50" />
      </div>
    </div>
  );
}
