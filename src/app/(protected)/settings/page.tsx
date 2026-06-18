import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompaniesTable } from "@/components/settings/CompaniesTable";
import { CompanyFormDialog } from "@/components/settings/CompanyFormDialog";
import { ExperienceCard } from "@/components/settings/ExperienceCard";
import { NotificationsLogList } from "@/components/settings/NotificationsLogList";
import { ScrapeRunsList } from "@/components/settings/ScrapeRunsList";
import { StatusConfigSection } from "@/components/settings/StatusConfigSection";
import { ThresholdsCard } from "@/components/settings/ThresholdsCard";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseNotificationRepository } from "@/features/notifications/infrastructure/SupabaseNotificationRepository";
import { SupabaseSettingsRepository } from "@/features/settings/infrastructure/SupabaseSettingsRepository";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";
import { optionalEnv } from "@/shared/infrastructure/env";

export default async function SettingsPage() {
  const client = await createSupabaseServerClient();
  const companyRepository = new SupabaseCompanyRepository(client);
  const jobRepository = new SupabaseJobRepository(client);
  const scrapeRunRepository = new SupabaseScrapeRunRepository(client);
  const notificationRepository = new SupabaseNotificationRepository(client);
  const settingsRepository = new SupabaseSettingsRepository(client);

  const [companies, statuses, scrapeRuns, notifications, desiredExperience] = await Promise.all([
    companyRepository.list(),
    jobRepository.listStatuses(),
    scrapeRunRepository.listRecent(20),
    notificationRepository.listRecent(20),
    settingsRepository.getDesiredExperienceYears(),
  ]);

  const keywordThreshold = optionalEnv("KEYWORD_THRESHOLD", "0.25");
  const notifyThreshold = optionalEnv("NOTIFY_THRESHOLD", "0.75");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage companies, scrape history, and scoring thresholds.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Companies</CardTitle>
          <CompanyFormDialog
            trigger={
              <Button size="sm">Add company</Button>
            }
          />
        </CardHeader>
        <CardContent>
          <CompaniesTable companies={companies} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusConfigSection initialStatuses={statuses} />
        </CardContent>
      </Card>

      <ExperienceCard current={desiredExperience} />

      <ThresholdsCard keywordThreshold={keywordThreshold} notifyThreshold={notifyThreshold} />

      <Card>
        <CardHeader>
          <CardTitle>Recent scrape runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            The scrape &rarr; score &rarr; notify pipeline runs via GitHub Actions, not from this app. Trigger it
            manually from the{" "}
            <a
              href="https://github.com/sahidhh/job-scraper/actions"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              repository&apos;s Actions tab
            </a>{" "}
            (workflow_dispatch).
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
    </div>
  );
}
