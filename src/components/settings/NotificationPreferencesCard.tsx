"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setNotificationPreferencesAction } from "@/features/notifications/actions";
import type { NotificationPreferences } from "@/features/notifications/domain/types";
import type { JobSource, LocationTag } from "@/shared/domain/enums";

function toCsv(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}

function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// Settings card for Telegram notification preferences (P1.5). All fields are
// optional; an empty field means "no filter" and preserves notify-all
// behaviour. Comma-separated free text keeps this consistent with how
// notifications.md already documents roles/skills as string lists.
export function NotificationPreferencesCard({ current }: { current: NotificationPreferences | null }) {
  const router = useRouter();
  const [roles, setRoles] = useState(toCsv(current?.roles));
  const [skills, setSkills] = useState(toCsv(current?.skills));
  const [locations, setLocations] = useState(toCsv(current?.locations));
  const [sources, setSources] = useState(toCsv(current?.sources));
  const [minExperience, setMinExperience] = useState(
    current?.minExperience === undefined ? "" : String(current.minExperience),
  );
  const [maxExperience, setMaxExperience] = useState(
    current?.maxExperience === undefined ? "" : String(current.maxExperience),
  );
  const [excludeCompanies, setExcludeCompanies] = useState(toCsv(current?.excludeCompanies));
  const [excludeKeywords, setExcludeKeywords] = useState(toCsv(current?.excludeKeywords));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    const minTrimmed = minExperience.trim();
    const maxTrimmed = maxExperience.trim();
    const min = minTrimmed === "" ? undefined : Number(minTrimmed);
    const max = maxTrimmed === "" ? undefined : Number(maxTrimmed);
    if (min !== undefined && !Number.isFinite(min)) {
      setError("Minimum experience must be a number.");
      return;
    }
    if (max !== undefined && !Number.isFinite(max)) {
      setError("Maximum experience must be a number.");
      return;
    }

    const prefs: NotificationPreferences = {
      roles: fromCsv(roles),
      skills: fromCsv(skills),
      locations: fromCsv(locations) as LocationTag[],
      sources: fromCsv(sources) as JobSource[],
      minExperience: min,
      maxExperience: max,
      excludeCompanies: fromCsv(excludeCompanies),
      excludeKeywords: fromCsv(excludeKeywords),
    };

    setError(null);
    startTransition(async () => {
      const result = await setNotificationPreferencesAction(prefs);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function clear() {
    setError(null);
    startTransition(async () => {
      const result = await setNotificationPreferencesAction(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRoles("");
      setSkills("");
      setLocations("");
      setSources("");
      setMinExperience("");
      setMaxExperience("");
      setExcludeCompanies("");
      setExcludeKeywords("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification preferences</CardTitle>
        <CardDescription>
          Include-only filters applied before a Telegram alert is sent. Leave a field blank to skip that filter.
          Mutes (excluded companies/keywords) apply on top of any include filters above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="notif-roles">Roles (title contains any of)</Label>
            <Input
              id="notif-roles"
              placeholder="backend engineer, platform engineer"
              value={roles}
              onChange={(event) => setRoles(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notif-skills">Skills (description mentions any of)</Label>
            <Input
              id="notif-skills"
              placeholder="Python, Kubernetes"
              value={skills}
              onChange={(event) => setSkills(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notif-locations">Locations (india, singapore, uae, remote)</Label>
            <Input
              id="notif-locations"
              placeholder="remote, india"
              value={locations}
              onChange={(event) => setLocations(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notif-sources">Sources (greenhouse, lever, ashby, wellfound, remoteok, mycareersfuture)</Label>
            <Input
              id="notif-sources"
              placeholder="greenhouse, lever"
              value={sources}
              onChange={(event) => setSources(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notif-min-exp">Min experience (years)</Label>
            <Input
              id="notif-min-exp"
              type="number"
              min={0}
              value={minExperience}
              onChange={(event) => setMinExperience(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notif-max-exp">Max experience (years)</Label>
            <Input
              id="notif-max-exp"
              type="number"
              min={0}
              value={maxExperience}
              onChange={(event) => setMaxExperience(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notif-exclude-companies">Muted companies (never notify)</Label>
            <Input
              id="notif-exclude-companies"
              placeholder="Acme Corp, Globex"
              value={excludeCompanies}
              onChange={(event) => setExcludeCompanies(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notif-exclude-keywords">Muted keywords (title contains any of)</Label>
            <Input
              id="notif-exclude-keywords"
              placeholder="intern, staffing"
              value={excludeKeywords}
              onChange={(event) => setExcludeKeywords(event.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={isPending}>
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={clear} disabled={isPending}>
            Clear all
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
