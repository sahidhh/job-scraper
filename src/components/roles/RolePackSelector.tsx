"use client";

import { useState, useTransition } from "react";
import { activateRolePackAction } from "@/features/roles/actions";
import type { RolePack, RoleSelection } from "@/features/roles/domain/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface RolePackSelectorProps {
  packs: RolePack[];
  activeSelection: RoleSelection | null;
}

export function RolePackSelector({ packs, activeSelection }: RolePackSelectorProps) {
  const [error, setError] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [localActiveId, setLocalActiveId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (packs.length === 0) return null;

  function isPackActive(pack: RolePack): boolean {
    if (localActiveId === pack.id) return true;
    return (
      activeSelection?.primaryRole === pack.name &&
      JSON.stringify(activeSelection.expandedRoles) === JSON.stringify(pack.roles)
    );
  }

  function handleActivate(pack: RolePack) {
    setError(null);
    setActivatingId(pack.id);
    startTransition(async () => {
      const result = await activateRolePackAction(pack.id);
      setActivatingId(null);
      if (result.ok) {
        setLocalActiveId(pack.id);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Role Packs</p>
        <p className="text-xs text-muted-foreground">
          Pre-defined role groups. Click a pack to activate it instantly.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {packs.map((pack) => {
          const active = isPackActive(pack);
          const isLoading = isPending && activatingId === pack.id;

          return (
            <Card key={pack.id} className={active ? "border-primary" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{pack.name}</CardTitle>
                {pack.description && (
                  <CardDescription className="text-xs">{pack.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1 pb-2">
                {pack.roles.map((role) => (
                  <Badge key={role} variant="outline" className="text-xs">
                    {role}
                  </Badge>
                ))}
              </CardContent>
              <CardFooter>
                <Button
                  size="sm"
                  variant={active ? "secondary" : "outline"}
                  disabled={isPending || active}
                  onClick={() => handleActivate(pack)}
                >
                  {active ? "Active" : isLoading ? "Activating..." : "Use pack"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
