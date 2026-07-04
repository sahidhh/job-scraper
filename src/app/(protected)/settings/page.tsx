import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompaniesTable } from "@/components/settings/CompaniesTable";
import { CompanyFormDialog } from "@/components/settings/CompanyFormDialog";
import { ExperienceCard } from "@/components/settings/ExperienceCard";
import { NotificationPreferencesCard } from "@/components/settings/NotificationPreferencesCard";
import { NotificationsLogList } from "@/components/settings/NotificationsLogList";
import { RankingPreferencesCard } from "@/components/settings/RankingPreferencesCard";
import { ScrapeRunsList } from "@/components/settings/ScrapeRunsList";
import { StatusConfigSection } from "@/components/settings/StatusConfigSection";
import { ThresholdsCard } from "@/components/settings/ThresholdsCard";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseNotificationPreferencesRepository } from "@/features/notifications/infrastructure/SupabaseNotificationPreferencesRepository";
import { SupabaseNotificationRepository } from "@/features/notifications/infrastructure/SupabaseNotificationRepository";
import { SupabaseRankingPreferencesRepository } from "@/features/scoring/infrastructure/SupabaseRankingPreferencesRepository";
import { SupabaseSettingsRepository } from "@/features/settings/infrastructure/SupabaseSettingsRepository";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";
import { optionalEnv } from "@/shared/infrastructure/env";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

export default async function SettingsPage() {
  const client = await createSupabaseServerClient();
  const companyRepository = new SupabaseCompanyRepository(client);
  const jobRepository = new SupabaseJobRepository(client);
  const scrapeRunRepository = new SupabaseScrapeRunRepository(client);
  const notificationRepository = new SupabaseNotificationRepository(client);
  const notificationPreferencesRepository = new SupabaseNotificationPreferencesRepository(client);
  const rankingPreferencesRepository = new SupabaseRankingPreferencesRepository(client);
  const settingsRepository = new SupabaseSettingsRepository(client);

  const [
    companies,
    statuses,
    scrapeRuns,
    notifications,
    desiredExperience,
    notificationPreferences,
    rankingPreferences,
  ] = await Promise.all([
    companyRepository.list(),
    jobRepository.listStatuses(),
    scrapeRunRepository.listRecent(20),
    notificationRepository.listRecent(20),
    settingsRepository.getDesiredExperienceYears(),
    notificationPreferencesRepository.getPreferences(),
    rankingPreferencesRepository.getPreferences(),
  ]);

  const keywordThreshold = optionalEnv("KEYWORD_THRESHOLD", "0.25");
  const notifyThreshold = optionalEnv("NOTIFY_THRESHOLD", "0.75");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Companies, statuses, scoring, and activity.</p>
      </div>

      {/* Sources */}
      <section className="space-y-3">
        <SectionLabel>Sources</SectionLabel>
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Companies</CardTitle>
            <CompanyFormDialog trigger={<Button size="sm">Add company</Button>} />
          </CardHeader>
          <CardContent>
            <CompaniesTable companies={companies} />
          </CardContent>
        </Card>
        <ExperienceCard current={desiredExperience} />
        <ThresholdsCard keywordThreshold={keywordThreshold} notifyThreshold={notifyThreshold} />
        <RankingPreferencesCard current={rankingPreferences} />
      </section>

      {/* Workflow */}
      <section className="space-y-3">
        <SectionLabel>Workflow</SectionLabel>
        <Card>
          <CardHeader>
            <CardTitle>Job statuses</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusConfigSection initialStatuses={statuses} />
          </CardContent>
        </Card>
      </section>

      {/* Notifications */}
      <section className="space-y-3">
        <SectionLabel>Notifications</SectionLabel>
        <NotificationPreferencesCard current={notificationPreferences} />
      </section>

      {/* Activity */}
      <section className="space-y-3">
        <SectionLabel>Activity</SectionLabel>
        <Card>
          <CardHeader>
            <CardTitle>Recent scrape runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              The scrape → score → notify pipeline runs via GitHub Actions.{" "}
              <a
                href="https://github.com/sahidhh/job-scraper/actions"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Trigger manually &rarr;
              </a>
            </div>
            <ScrapeRunsList runs={scrapeRuns} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationsLogList entries={notifications} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
