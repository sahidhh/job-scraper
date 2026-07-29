"use client";

import { useEffect, useState } from "react";
import { getCompanyHistoryAction } from "@/features/jobs/actions";
import type { JobWithScore } from "@/features/jobs/domain/types";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function CompanyHistoryPanel({ companyName }: { companyName: string }) {
  const [jobs, setJobs] = useState<JobWithScore[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  // A failed lookup used to render as "No prior applications found." -- the
  // one message that reads as a confident answer. Error and empty are
  // different states and say different things.
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCompanyHistoryAction(companyName).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setJobs(res.data.jobs);
        setHasMore(res.data.hasMore);
        setError(null);
      } else {
        setJobs(null);
        setError(res.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [companyName]);

  async function loadMore() {
    if (jobs === null) return;
    setLoadingMore(true);
    const res = await getCompanyHistoryAction(companyName, jobs.length);
    if (res.ok) {
      setJobs([...jobs, ...res.data.jobs]);
      setHasMore(res.data.hasMore);
    } else {
      setError(res.error);
    }
    setLoadingMore(false);
  }

  if (loading) return <div className="p-4"><Loader2 className="animate-spin" /></div>;

  if (error !== null) {
    return (
      <div role="status" className="p-4 text-sm text-destructive">
        Company history didn’t load: {error}. Collapse the row and open it again to retry.
      </div>
    );
  }

  // jobs.length <= 1 alone would misread a short first page (e.g. limit
  // reached with the row itself as the only entry so far) as "no history" --
  // hasMore says whether there's really nothing else to find.
  if (jobs === null || (jobs.length <= 1 && !hasMore)) {
    return <div className="p-4 text-sm text-muted-foreground">No prior applications found.</div>;
  }

  // The action already scopes the query to this company -- no client-side
  // re-filter.
  return (
    <div className="space-y-2">
      <div className="rounded-md border">
        <Table>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="text-sm">{job.title}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{job.postedAt ? new Date(job.postedAt).toLocaleDateString() : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hasMore && (
        <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? <Loader2 className="animate-spin" /> : "Load more"}
        </Button>
      )}
    </div>
  );
}
