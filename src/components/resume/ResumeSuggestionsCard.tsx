"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applyResumeSuggestionsAction, suggestResumeImprovementsAction } from "@/features/resume/actions";
import type { ResumeSuggestionSet } from "@/features/resume/domain/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResumeSuggestionsCard() {
  const router = useRouter();
  const [targetRole, setTargetRole] = useState("");
  const [suggestionSet, setSuggestionSet] = useState<ResumeSuggestionSet | null>(null);
  const [chosenIds, setChosenIds] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function getSuggestions() {
    setError(null);
    setApplied(false);
    startTransition(async () => {
      const result = await suggestResumeImprovementsAction(targetRole);
      if (result.ok) {
        setSuggestionSet(result.data);
        setChosenIds(new Set());
      } else {
        setError(result.error);
      }
    });
  }

  function toggle(id: string) {
    setChosenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function applyChosen() {
    if (!suggestionSet || chosenIds.size === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await applyResumeSuggestionsAction(suggestionSet.id, [...chosenIds]);
      if (result.ok) {
        setSuggestionSet(null);
        setChosenIds(new Set());
        setApplied(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (!suggestionSet) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={targetRole}
            onChange={(event) => setTargetRole(event.target.value)}
            placeholder="Target role (optional)"
            disabled={isPending}
          />
          <Button type="button" onClick={getSuggestions} disabled={isPending}>
            {isPending ? "Generating..." : "Get suggestions"}
          </Button>
        </div>
        {applied && <p className="text-sm text-muted-foreground">Applied as a new resume version.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {suggestionSet.suggestions.map((item) => (
          <li key={item.id} className="flex items-start gap-2 rounded-md border p-2">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={chosenIds.has(item.id)}
                onChange={() => toggle(item.id)}
                disabled={isPending}
                className="mt-1 size-4 accent-primary"
                aria-label={`Apply suggestion: ${item.title}`}
              />
              <span className="space-y-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium">{item.title}</span>
                  <Badge variant="secondary">{item.category}</Badge>
                </span>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setSuggestionSet(null)} disabled={isPending}>
          Discard
        </Button>
        <Button type="button" onClick={applyChosen} disabled={isPending || chosenIds.size === 0}>
          {isPending ? "Applying..." : `Apply selected (${chosenIds.size})`}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
