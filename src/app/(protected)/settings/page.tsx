import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompaniesTable } from "@/components/settings/CompaniesTable";
import { CompanyFormDialog } from "@/components/settings/CompanyFormDialog";
import { NotificationsLogList } from "@/components/settings/NotificationsLogList";
import { ScrapeRunsList } from "@/components/settings/ScrapeRunsList";
import { ThresholdsCard } from "@/components/settings/ThresholdsCard";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import { SupabaseNotificationRepository } from "@/features/notifications/infrastructure/SupabaseNotificationRepository";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";
import { optionalEnv } from "@/shared/infrastructure/env";

export default async function SettingsPage() {
  const client = await createSupabaseServerClient();
  const companyRepository = new SupabaseCompanyRepository(client);
  const scrapeRunRepository = new SupabaseScrapeRunRepository(client);
  const notificationRepository = new SupabaseNotificationRepository(client);

  const [companies, scrapeRuns, notifications] = await Promise.all([
    companyRepository.list(),
    scrapeRunRepository.listRecent(20),
    notificationRepository.listRecent(20),
  ]);

  const keywordThreshold = optionalEnv("KEYWORD_THRESHOLD", "0.5");
  const notifyThreshold = optionalEnv("NOTIFY_THRESHOLD", "0.75");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage companies, scrape history, and scoring thresholds.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
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
