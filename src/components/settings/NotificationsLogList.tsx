import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { NotificationLogItem } from "@/features/notifications/domain/types";

export function NotificationsLogList({ entries }: { entries: NotificationLogItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Job</TableHead>
          <TableHead>Company</TableHead>
          <TableHead className="hidden md:table-cell">Source</TableHead>
          <TableHead className="hidden md:table-cell">Sent at</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="font-medium">{entry.jobTitle}</TableCell>
            <TableCell>{entry.companyName}</TableCell>
            <TableCell className="hidden md:table-cell">
              <Badge variant="secondary">{entry.source}</Badge>
            </TableCell>
            <TableCell className="hidden md:table-cell">{new Date(entry.sentAt).toLocaleString()}</TableCell>
          </TableRow>
        ))}
        {entries.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground">
              No notifications sent yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
