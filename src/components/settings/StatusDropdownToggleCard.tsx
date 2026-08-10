"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setShowStatusDropdownAction } from "@/features/settings/actions";

// Settings card for whether the dashboard's per-job status control is an
// interactive dropdown/sheet or a read-only badge. Saves on toggle -- same
// reasoning as SponsorshipCard, only one boolean here too.
export function StatusDropdownToggleCard({ current }: { current: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const result = await setShowStatusDropdownAction(next);
      if (!result.ok) {
        setEnabled(!next); // revert the optimistic flip
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status dropdown</CardTitle>
        <CardDescription>
          Turn off to hide the per-job status picker and rely on the quick-action buttons
          (Not Interested / Viewed / Applied / Archive) instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => toggle(event.target.checked)}
            disabled={isPending}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>Show the status dropdown on each job row/card.</span>
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
