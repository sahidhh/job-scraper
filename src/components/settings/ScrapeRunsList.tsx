import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ScrapeRun } from "@/features/sources/domain/types";

const STATUS_VARIANT = {
  success: "default",
  partial: "secondary",
  failed: "destructive",
} as const;

export function ScrapeRunsList({ runs }: { runs: ScrapeRun[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Jobs found</TableHead>
          <TableHead>Run at</TableHead>
          <TableHead>Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id}>
            <TableCell className="font-medium">{run.source}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
            </TableCell>
            <TableCell>{run.jobsFound}</TableCell>
            <TableCell>{new Date(run.runAt).toLocaleString()}</TableCell>
            <TableCell className="max-w-xs truncate">{run.error ?? "—"}</TableCell>
          </TableRow>
        ))}
        {runs.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No scrape runs yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
