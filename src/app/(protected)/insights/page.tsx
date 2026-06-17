import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeSkillDemand } from "@/features/insights/application/computeSkillDemand";
import { computeSkillGaps } from "@/features/insights/application/computeSkillGaps";
import { SupabaseMatchedJobsRepository } from "@/features/insights/infrastructure/SupabaseMatchedJobsRepository";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { SKILLS_DICTIONARY } from "@/shared/config/skills-dictionary";
import { extractSkills } from "@/shared/domain/skills";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

// How many rows each card shows before it gets noisy.
const MAX_ROWS = 15;

export default async function InsightsPage() {
  const client = await createSupabaseServerClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const activeSelection = await roleRepository.getActiveSelection();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-sm text-muted-foreground">
          {activeSelection
            ? `Skill demand among jobs matching "${activeSelection.primaryRole}". This reflects only your scraped, role-matched jobs — not the wider market.`
            : "Set up a role selection to see skill insights."}
        </p>
      </div>

      {activeSelection ? (
        <InsightsContent roleSelectionId={activeSelection.id} expandedRoles={activeSelection.expandedRoles} />
      ) : (
        <Button asChild>
          <Link href="/roles">Choose a role</Link>
        </Button>
      )}
    </div>
  );
}

async function InsightsContent({
  roleSelectionId,
  expandedRoles,
}: {
  roleSelectionId: string;
  expandedRoles: string[];
}) {
  const client = await createSupabaseServerClient();
  const resumeRepository = new SupabaseResumeRepository(client);
  const matchedJobsRepository = new SupabaseMatchedJobsRepository(client);

  const [resume, matchedJobs] = await Promise.all([
    resumeRepository.getActive(),
    matchedJobsRepository.findRoleMatchedJobs(roleSelectionId, expandedRoles),
  ]);

  // Recompute skills per job at read time (no persisted column) -- cheap at
  // single-user scale, keeps the scrape/ingest pipeline untouched.
  const jobsSkills = matchedJobs.map((job) => extractSkills(`${job.title}\n${job.description}`, SKILLS_DICTIONARY));
  const resumeSkills = resume?.skills ?? [];

  const gaps = computeSkillGaps(resumeSkills, jobsSkills);
  const demand = computeSkillDemand(jobsSkills);
  const jobCount = matchedJobs.length;

  if (jobCount === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
        No role-matched jobs yet. Insights appear once the scraper has collected jobs matching your role selection.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Level up</CardTitle>
          <CardDescription>
            Skills your matched jobs ask for that aren&rsquo;t on your resume — learning these should raise your
            compatibility.
            {resume ? null : " Upload a resume to personalise this."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No gaps found — your resume covers every dictionary skill these jobs mention.
            </p>
          ) : (
            <ul className="space-y-2">
              {gaps.slice(0, MAX_ROWS).map((gap) => (
                <SkillRow key={gap.skill} skill={gap.skill} count={gap.demandCount} total={jobCount} variant="warning" />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>In demand</CardTitle>
          <CardDescription>Most-requested skills across your {jobCount} matched jobs.</CardDescription>
        </CardHeader>
        <CardContent>
          {demand.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recognised skills mentioned in these jobs yet.</p>
          ) : (
            <ul className="space-y-2">
              {demand.slice(0, MAX_ROWS).map((item) => (
                <SkillRow key={item.skill} skill={item.skill} count={item.count} total={jobCount} variant="info" />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// A skill row with a proportion bar (share of matched jobs mentioning it).
function SkillRow({
  skill,
  count,
  total,
  variant,
}: {
  skill: string;
  count: number;
  total: number;
  variant: "warning" | "info";
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barColor = variant === "warning" ? "bg-warning" : "bg-info";

  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{skill}</span>
        <Badge variant="outline">
          {count} / {total}
        </Badge>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}
