"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setEnabledSourcesAction } from "@/features/settings/actions";
import { JOB_SOURCES, type JobSource } from "@/shared/domain/enums";

const PRIMARY_SOURCES = new Set<JobSource>(["naukri", "naukrigulf"]);

export function EnabledSourcesCard({ current }: { current: JobSource[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<JobSource[]>(current);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleSource(source: JobSource, checked: boolean) {
    const previous = selected;
    const next = checked
      ? [...new Set([...selected, source])]
      : selected.filter((item) => item !== source);

    setSelected(next);
    setError(null);
    startTransition(async () => {
      const result = await setEnabledSourcesAction(next);
      if (!result.ok) {
        setSelected(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enabled sources</CardTitle>
        <CardDescription>
          Choose which job sources are scraped on scheduled runs. Naukri and NaukriGulf are enabled by default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {JOB_SOURCES.map((source) => {
            const isChecked = selected.includes(source);
            const isPrimary = PRIMARY_SOURCES.has(source);
            return (
              <label key={source} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(event) => toggleSource(source, event.target.checked)}
                  disabled={isPending}
                  className="size-4 accent-primary"
                />
                <span className={isPrimary ? "font-medium" : undefined}>
                  {source}
                  {isPrimary && (
                    <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                      Primary
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
