import { NotificationsLogList } from "@/components/settings/NotificationsLogList";
import { ScrapeRunsList } from "@/components/settings/ScrapeRunsList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseNotificationRepository } from "@/features/notifications/infrastructure/SupabaseNotificationRepository";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

export default async function SettingsActivityPage() {
  const client = await createSupabaseServerClient();
  const scrapeRunRepository = new SupabaseScrapeRunRepository(client);
  const notificationRepository = new SupabaseNotificationRepository(client);

  const [scrapeRuns, notifications] = await Promise.all([
    scrapeRunRepository.listRecent(20),
    notificationRepository.listRecent(20),
  ]);

  return (
    <section className="space-y-3">
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
  );
}
