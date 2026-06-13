"use client";

import { useState, useTransition } from "react";
import { createCompanyAction, updateCompanyAction } from "@/features/companies/actions";
import type { Company } from "@/features/companies/domain/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JOB_SOURCES, SOURCES_REQUIRING_BOARD_TOKEN, type JobSource } from "@/shared/domain/enums";

interface CompanyFormDialogProps {
  company?: Company;
  trigger: React.ReactNode;
}

export function CompanyFormDialog({ company, trigger }: CompanyFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(company?.name ?? "");
  const [source, setSource] = useState<JobSource>(company?.source ?? "greenhouse");
  const [boardToken, setBoardToken] = useState(company?.boardToken ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const requiresToken = SOURCES_REQUIRING_BOARD_TOKEN.includes(source);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const input = {
      name: name.trim(),
      source,
      boardToken: requiresToken ? boardToken.trim() : null,
      active: company?.active ?? true,
    };

    startTransition(async () => {
      const result = company ? await updateCompanyAction(company.id, input) : await createCompanyAction(input);
      if (result.ok) {
        setOpen(false);
        if (!company) {
          setName("");
          setBoardToken("");
        }
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{company ? "Edit company" : "Add company"}</DialogTitle>
            <DialogDescription>Companies are scraped per source for new job postings.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Select value={source} onValueChange={(value) => setSource(value as JobSource)}>
                <SelectTrigger id="source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_SOURCES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {requiresToken && (
              <div className="space-y-2">
                <Label htmlFor="boardToken">Board token</Label>
                <Input
                  id="boardToken"
                  value={boardToken}
                  onChange={(event) => setBoardToken(event.target.value)}
                  placeholder="e.g. stripe"
                  required
                />
              </div>
            )}
          </div>
          {error && <p className="pb-2 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
