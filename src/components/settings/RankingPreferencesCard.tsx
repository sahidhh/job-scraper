"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setRankingPreferencesAction } from "@/features/scoring/actions";
import type { RankingPreferences } from "@/features/scoring/domain/types";

const DEFAULT_COMPANY_BONUS = 0.05;
const DEFAULT_REMOTE_BONUS = 0.03;
const DEFAULT_SALARY_BONUS = 0.02;

function toCsv(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}

function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// Settings card for the deterministic composite ranking score (Theme 1):
// dashboard sort blends aiScore with small additive bonuses. All fields
// optional; leaving a bonus blank uses its documented default.
export function RankingPreferencesCard({ current }: { current: RankingPreferences | null }) {
  const router = useRouter();
  const [preferredCompanies, setPreferredCompanies] = useState(toCsv(current?.preferredCompanies));
  const [preferRemote, setPreferRemote] = useState(current?.preferRemote ?? false);
  const [companyBonus, setCompanyBonus] = useState(
    current?.companyBonus === undefined ? "" : String(current.companyBonus),
  );
  const [remoteBonus, setRemoteBonus] = useState(
    current?.remoteBonus === undefined ? "" : String(current.remoteBonus),
  );
  const [salaryBonus, setSalaryBonus] = useState(
    current?.salaryBonus === undefined ? "" : String(current.salaryBonus),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function parseBonus(value: string, label: string): number | undefined {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      throw new Error(`${label} must be a number between 0 and 1.`);
    }
    return n;
  }

  function save() {
    let prefs: RankingPreferences;
    try {
      prefs = {
        preferredCompanies: fromCsv(preferredCompanies),
        preferRemote,
        companyBonus: parseBonus(companyBonus, "Company bonus"),
        remoteBonus: parseBonus(remoteBonus, "Remote bonus"),
        salaryBonus: parseBonus(salaryBonus, "Salary bonus"),
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid input.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await setRankingPreferencesAction(prefs);
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
      const result = await setRankingPreferencesAction(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreferredCompanies("");
      setPreferRemote(false);
      setCompanyBonus("");
      setRemoteBonus("");
      setSalaryBonus("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ranking</CardTitle>
        <CardDescription>
          The dashboard sorts by AI score plus small bonuses for signals the AI score doesn&rsquo;t already capture.
          Jobs that got a bonus show why next to their score. Leave a bonus blank to use its default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rank-companies">Preferred companies</Label>
            <Input
              id="rank-companies"
              placeholder="Acme Corp, Globex"
              value={preferredCompanies}
              onChange={(event) => setPreferredCompanies(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rank-company-bonus">Company bonus</Label>
            <Input
              id="rank-company-bonus"
              type="number"
              min={0}
              max={1}
              step={0.01}
              placeholder={String(DEFAULT_COMPANY_BONUS)}
              value={companyBonus}
              onChange={(event) => setCompanyBonus(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rank-remote-bonus">Remote bonus</Label>
            <Input
              id="rank-remote-bonus"
              type="number"
              min={0}
              max={1}
              step={0.01}
              placeholder={String(DEFAULT_REMOTE_BONUS)}
              value={remoteBonus}
              onChange={(event) => setRemoteBonus(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rank-salary-bonus">Salary-disclosed bonus</Label>
            <Input
              id="rank-salary-bonus"
              type="number"
              min={0}
              max={1}
              step={0.01}
              placeholder={String(DEFAULT_SALARY_BONUS)}
              value={salaryBonus}
              onChange={(event) => setSalaryBonus(event.target.value)}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={preferRemote}
              onChange={(event) => setPreferRemote(event.target.checked)}
              className="size-4 accent-primary"
            />
            <span>Prefer remote jobs</span>
          </label>
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
