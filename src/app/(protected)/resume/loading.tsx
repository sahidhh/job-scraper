// Route-level skeleton for /resume. This is the route the audit called out --
// the resume page awaits two Supabase round-trips with no fallback at all, so
// the sidebar click used to sit dead. Tracks ResumePage: the max-w-2xl column,
// heading, the upload card (header + drop zone, hence the taller block), and
// the extracted-skills / AI-suggestions cards below it.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-28 animate-pulse rounded bg-muted" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-muted" />
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/50" />
      <div className="h-44 animate-pulse rounded-xl border border-border bg-muted/50" />
      <div className="h-44 animate-pulse rounded-xl border border-border bg-muted/50" />
    </div>
  );
}
