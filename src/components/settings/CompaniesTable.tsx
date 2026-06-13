import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Company } from "@/features/companies/domain/types";
import { CompanyFormDialog } from "./CompanyFormDialog";
import { DeleteCompanyButton } from "./DeleteCompanyButton";

export function CompaniesTable({ companies }: { companies: Company[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Board token</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {companies.map((company) => (
          <TableRow key={company.id}>
            <TableCell className="font-medium">{company.name}</TableCell>
            <TableCell>{company.source}</TableCell>
            <TableCell>{company.boardToken ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={company.active ? "default" : "secondary"}>
                {company.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell className="flex justify-end gap-2">
              <CompanyFormDialog
                company={company}
                trigger={
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                }
              />
              <DeleteCompanyButton id={company.id} name={company.name} />
            </TableCell>
          </TableRow>
        ))}
        {companies.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No companies yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
