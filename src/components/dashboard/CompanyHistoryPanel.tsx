"use client";

import { useEffect, useState } from "react";
import { getCompanyHistoryAction } from "@/features/jobs/actions";
import type { Job } from "@/features/jobs/domain/types";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export function CompanyHistoryPanel({ companyName }: { companyName: string }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCompanyHistoryAction(companyName).then((res) => {
      if (res.ok) setJobs(res.data ?? []);
      setLoading(false);
    });
  }, [companyName]);

  if (loading) return <div className="p-4"><Loader2 className="animate-spin" /></div>;
  if (!jobs || jobs.length <= 1) return <div className="p-4 text-sm text-muted-foreground">No prior applications found.</div>;

  return (
    <div className="rounded-md border">
        <Table>
          <TableBody>
            {jobs.filter(j => j.companyName === companyName).map((job) => (
              <TableRow key={job.id}>
                <TableCell className="text-sm">{job.title}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(job.postedAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
    </div>
  );
}
