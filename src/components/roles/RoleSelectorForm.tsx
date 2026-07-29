"use client";

import Link from "next/link";
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
  const [selectedRoles, setSelectedRoles] = useState<string[]>(activeSelection?.expandedRoles ?? []);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const trimmedRole = primaryRole.trim();
  const isActiveSelection =
    confirmed ||
    (activeSelection?.primaryRole.toLowerCase() === trimmedRole.toLowerCase() &&
      JSON.stringify(activeSelection?.expandedRoles) === JSON.stringify(selectedRoles));

  // Guarded rather than relying on the submit button's `disabled` alone: the
  // form can also be submitted implicitly (Enter in the role input), and an
  // empty or whitespace-only role must not reach the server action.
  function handleExpand() {
    if (isPending || trimmedRole.length === 0) return;
    setError(null);
    setConfirmed(false);
    startTransition(async () => {
      const result = await expandRoleAction(trimmedRole);
      if (result.ok) {
        setPreview(result.data);
        setSelectedRoles(result.data.relatedRoles);
      } else {
        setError(result.error);
        setPreview(null);
        setSelectedRoles([]);
      }
    });
  }

  function toggleRole(role: string) {
    setConfirmed(false);
    setSelectedRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );
  }

  function handleConfirm() {
    if (!preview || selectedRoles.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmRoleSelectionAction(trimmedRole, selectedRoles);
      if (result.ok) {
        setConfirmed(true);
      } else {
        setError(result.error);
      }
    });
  }

  // A role typed into the "+ Add role" chip joins the preview list already
  // selected -- you added it on purpose, so making you click it again to
  // select it would be busywork. Duplicates are ignored (case-insensitive).
  function addCustomRole(role: string) {
    const trimmed = role.trim();
    if (trimmed.length === 0 || !preview) return;
    const exists = preview.relatedRoles.some((r) => r.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      setPreview({ ...preview, relatedRoles: [...preview.relatedRoles, trimmed] });
    }
    setSelectedRoles((current) =>
      current.some((r) => r.toLowerCase() === trimmed.toLowerCase()) ? current : [...current, trimmed],
    );
  }

  return (
    <div className="space-y-4">
      {/* A real form so Enter in the role input expands, the same as clicking
          the button -- native implicit submission rather than a keydown hack.
          Only this row is wrapped; the preview card below has its own inputs
          and forms cannot nest. */}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          handleExpand();
        }}
      >
        <Input
          value={primaryRole}
          onChange={(event) => {
            setPrimaryRole(event.target.value);
            setConfirmed(false);
          }}
          placeholder="e.g. Full Stack Developer"
        />
        <Button type="submit" disabled={isPending || trimmedRole.length === 0}>
          {isPending ? "Expanding..." : "Expand"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {preview && (
        <ExpandedRolesCard
          relatedRoles={preview.relatedRoles}
          selectedRoles={selectedRoles}
          onToggleRole={toggleRole}
          onAddRole={addCustomRole}
          source={preview.source}
          onConfirm={handleConfirm}
          isPending={isPending}
          isActive={isActiveSelection}
        />
      )}
      {isActiveSelection && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm sm:flex-row sm:items-center">
          <p className="text-muted-foreground">Saved! This is now your active role selection.</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard">View matching jobs &rarr;</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
