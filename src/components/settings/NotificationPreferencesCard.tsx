"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMPLOYMENT_TYPES } from "@/features/jobs/domain/extractJobAttributes";
import { setNotificationPreferencesAction } from "@/features/notifications/actions";
import type { NotificationPreferences } from "@/features/notifications/domain/types";
import { JOB_SOURCES, LOCATION_TAGS } from "@/shared/domain/enums";

function toCsv(values: string[] | undefined): string {
  return values?.join(", ") ?? "";
}

function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function toNumberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

// Settings card for Telegram notification filters (P1.5, shipped without a
// UI until now -- the only way to configure these was a direct app_settings
// write). Include filters (roles/skills/locations/sources/experience) are
// ANDed; exclude filters (blockedCompanies/excludeEmploymentTypes/
// excludeKeywords) further narrow the result. All fields are optional;
// leaving everything blank clears preferences entirely (notify on every
// match, the original default).
export function NotificationPreferencesCard({ current }: { current: NotificationPreferences | null }) {
  const router = useRouter();
  const [roles, setRoles] = useState(toCsv(current?.roles));
  const [skills, setSkills] = useState(toCsv(current?.skills));
  const [locations, setLocations] = useState(toCsv(current?.locations));
  const [sources, setSources] = useState(toCsv(current?.sources));
  const [minExperience, setMinExperience] = useState(current?.minExperience?.toString() ?? "");
  const [maxExperience, setMaxExperience] = useState(current?.maxExperience?.toString() ?? "");
  const [blockedCompanies, setBlockedCompanies] = useState(toCsv(current?.blockedCompanies));
  const [excludeEmploymentTypes, setExcludeEmploymentTypes] = useState(toCsv(current?.excludeEmploymentTypes));
  const [excludeKeywords, setExcludeKeywords] = useState(toCsv(current?.excludeKeywords));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);

    const invalidLocations = fromCsv(locations).filter((l) => !LOCATION_TAGS.includes(l as never));
    if (invalidLocations.length > 0) {
      setError(`Unknown location(s): ${invalidLocations.join(", ")}. Valid: ${LOCATION_TAGS.join(", ")}.`);
      return;
    }
    const invalidSources = fromCsv(sources).filter((s) => !JOB_SOURCES.includes(s as never));
    if (invalidSources.length > 0) {
      setError(`Unknown source(s): ${invalidSources.join(", ")}. Valid: ${JOB_SOURCES.join(", ")}.`);
      return;
    }
    const invalidTypes = fromCsv(excludeEmploymentTypes).filter((t) => !EMPLOYMENT_TYPES.includes(t as never));
    if (invalidTypes.length > 0) {
      setError(`Unknown employment type(s): ${invalidTypes.join(", ")}. Valid: ${EMPLOYMENT_TYPES.join(", ")}.`);
      return;
    }

    const prefs: NotificationPreferences = {
      roles: fromCsv(roles),
      skills: fromCsv(skills),
      locations: fromCsv(locations) as NotificationPreferences["locations"],
      sources: fromCsv(sources) as NotificationPreferences["sources"],
      minExperience: toNumberOrUndefined(minExperience),
      maxExperience: toNumberOrUndefined(maxExperience),
      blockedCompanies: fromCsv(blockedCompanies),
      excludeEmploymentTypes: fromCsv(excludeEmploymentTypes) as NotificationPreferences["excludeEmploymentTypes"],
      excludeKeywords: fromCsv(excludeKeywords),
    };

    // Every field empty/undefined -> clear preferences (matches
    // NotificationPreferencesRepository's "null = notify all" contract).
    const isEmpty = Object.values(prefs).every((v) => v === undefined || (Array.isArray(v) && v.length === 0));

    startTransition(async () => {
      const result = await setNotificationPreferencesAction(isEmpty ? null : prefs);
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
      setBlockedCompanies("");
      setExcludeEmploymentTypes("");
      setExcludeKeywords("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification filters</CardTitle>
        <CardDescription>
          Narrow which matched jobs trigger a Telegram alert. Include filters are comma-separated lists; leaving a
          field blank means &ldquo;no filter&rdquo;. Exclude filters (blocked companies/employment types/keywords)
          apply on top of the include filters above. Leave everything blank to notify on every match.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="np-roles">Roles (title contains any of)</Label>
            <Input id="np-roles" value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="e.g. backend engineer, platform" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-skills">Skills</Label>
            <Input id="np-skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="e.g. React, Python" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-locations">Locations ({LOCATION_TAGS.join(", ")})</Label>
            <Input id="np-locations" value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="e.g. remote, india" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-sources">Sources ({JOB_SOURCES.join(", ")})</Label>
            <Input id="np-sources" value={sources} onChange={(e) => setSources(e.target.value)} placeholder="e.g. greenhouse, lever" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-min-exp">Min experience (years)</Label>
            <Input id="np-min-exp" type="number" min={0} value={minExperience} onChange={(e) => setMinExperience(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-max-exp">Max experience (years)</Label>
            <Input id="np-max-exp" type="number" min={0} value={maxExperience} onChange={(e) => setMaxExperience(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-blocked-companies">Blocked companies</Label>
            <Input
              id="np-blocked-companies"
              value={blockedCompanies}
              onChange={(e) => setBlockedCompanies(e.target.value)}
              placeholder="e.g. Staffing Co, Acme Recruiters"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-exclude-types">Exclude employment types ({EMPLOYMENT_TYPES.join(", ")})</Label>
            <Input
              id="np-exclude-types"
              value={excludeEmploymentTypes}
              onChange={(e) => setExcludeEmploymentTypes(e.target.value)}
              placeholder="e.g. internship, contract"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="np-exclude-keywords">Muted keywords (title contains any of)</Label>
            <Input
              id="np-exclude-keywords"
              value={excludeKeywords}
              onChange={(e) => setExcludeKeywords(e.target.value)}
              placeholder="e.g. intern, staffing"
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
