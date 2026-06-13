"use client";

import { useTransition } from "react";
import { deleteCompanyAction } from "@/features/companies/actions";
import { Button } from "@/components/ui/button";

interface DeleteCompanyButtonProps {
  id: string;
  name: string;
}

export function DeleteCompanyButton({ id, name }: DeleteCompanyButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteCompanyAction(id);
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
      {isPending ? "Deleting..." : "Delete"}
    </Button>
  );
}
