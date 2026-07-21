"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setSkipUnsponsoredForeignJobsAction } from "@/features/settings/actions";

// Settings card for the ingest-time sponsorship filter (AD-51). Saves on
// toggle -- there's only one boolean, so an explicit Save button (as on
// ExperienceCard, where a half-typed number needs one) would just be a
// second click.
export function SponsorshipCard({ current }: { current: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const result = await setSkipUnsponsoredForeignJobsAction(next);
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
        <CardTitle>Visa sponsorship</CardTitle>
        <CardDescription>
          Applies to future scrape runs only &mdash; jobs already saved are unaffected.
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
          <span>
            Skip UAE/Singapore onsite jobs that say they won&rsquo;t sponsor a visa.
            <span className="mt-1 block text-muted-foreground">
              Only postings that explicitly rule sponsorship out are dropped. Most employers never mention it, and
              those are kept &mdash; as are all India and remote jobs, which need no sponsorship.
            </span>
          </span>
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
