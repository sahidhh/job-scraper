"use client";

import { useState, useTransition } from "react";
import { confirmRoleSelectionAction, expandRoleAction } from "@/features/roles/actions";
import type { RoleSelection } from "@/features/roles/domain/types";
import type { RoleMapSource } from "@/shared/domain/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExpandedRolesCard } from "./ExpandedRolesCard";

interface Preview {
  relatedRoles: string[];
  source: RoleMapSource;
}

export function RoleSelectorForm({ activeSelection }: { activeSelection: RoleSelection | null }) {
  const [primaryRole, setPrimaryRole] = useState(activeSelection?.primaryRole ?? "");
  const [preview, setPreview] = useState<Preview | null>(
    activeSelection ? { relatedRoles: activeSelection.expandedRoles, source: "seed" } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const trimmedRole = primaryRole.trim();
  const isActiveSelection =
    confirmed ||
    (activeSelection?.primaryRole.toLowerCase() === trimmedRole.toLowerCase() &&
      JSON.stringify(activeSelection?.expandedRoles) === JSON.stringify(preview?.relatedRoles));

  function handleExpand() {
    setError(null);
    setConfirmed(false);
    startTransition(async () => {
      const result = await expandRoleAction(trimmedRole);
      if (result.ok) {
        setPreview(result.data);
      } else {
        setError(result.error);
        setPreview(null);
      }
    });
  }

  function handleConfirm() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmRoleSelectionAction(trimmedRole, preview.relatedRoles);
      if (result.ok) {
        setConfirmed(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={primaryRole}
          onChange={(event) => {
            setPrimaryRole(event.target.value);
            setConfirmed(false);
          }}
          placeholder="e.g. Full Stack Developer"
        />
        <Button onClick={handleExpand} disabled={isPending || trimmedRole.length === 0}>
          {isPending ? "Expanding..." : "Expand"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {preview && (
        <ExpandedRolesCard
          relatedRoles={preview.relatedRoles}
          source={preview.source}
          onConfirm={handleConfirm}
          isPending={isPending}
          isActive={isActiveSelection}
        />
      )}
    </div>
  );
}
