"use client";

import { useState, useTransition } from "react";
import { restoreResumeVersionAction } from "@/features/resume/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ResumeVersionSummary {
  id: string;
  version: number;
  uploadedAt: string;
  isActive: boolean;
  origin: "Uploaded" | "AI-applied";
}

interface ResumeVersionHistoryProps {
  versions: ResumeVersionSummary[];
}

export function ResumeVersionHistory({ versions }: ResumeVersionHistoryProps) {
  const [restoredId, setRestoredId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRestore(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await restoreResumeVersionAction(id);
      setPendingId(null);
      if (result.ok) {
        setRestoredId(id);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-md border">
        {versions.map((version) => {
          const isRestoredActive = version.id === restoredId;
          const isActive = version.isActive || isRestoredActive;
          return (
            <li key={version.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Version {version.version}</span>
                  <Badge variant={version.origin === "Uploaded" ? "secondary" : "outline"}>{version.origin}</Badge>
                  {isActive && <Badge>Active</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{new Date(version.uploadedAt).toLocaleString()}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isActive || (isPending && pendingId === version.id)}
                onClick={() => handleRestore(version.id)}
              >
                {isPending && pendingId === version.id ? "Restoring..." : "Restore"}
              </Button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
