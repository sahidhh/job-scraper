"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { setDesiredExperienceAction } from "@/features/settings/actions";

// Settings card for the soft experience filter (P2). Empty input clears the
// setting; jobs with unknown experience are never hidden.
export function ExperienceCard({ current }: { current: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current === null ? "" : String(current));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    const trimmed = value.trim();
    const years = trimmed === "" ? null : Number(trimmed);
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 50)) {
      setError("Enter a whole number of years (0–50), or leave blank to clear.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setDesiredExperienceAction(years);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Desired experience</CardTitle>
        <CardDescription>
          Max years of experience to show on the dashboard. Jobs whose requirement can&rsquo;t be parsed are always
          shown. Leave blank for no limit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={50}
            placeholder="No limit"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">years</span>
          <Button size="sm" onClick={save} disabled={isPending}>
            Save
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
