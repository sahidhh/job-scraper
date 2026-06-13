import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompaniesTable } from "@/components/settings/CompaniesTable";
import { CompanyFormDialog } from "@/components/settings/CompanyFormDialog";
import { ScrapeRunsList } from "@/components/settings/ScrapeRunsList";
import { ThresholdsCard } from "@/components/settings/ThresholdsCard";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";
import { optionalEnv } from "@/shared/infrastructure/env";

export default async function SettingsPage() {
  const client = await createSupabaseServerClient();
  const companyRepository = new SupabaseCompanyRepository(client);
  const scrapeRunRepository = new SupabaseScrapeRunRepository(client);

  const [companies, scrapeRuns] = await Promise.all([
    companyRepository.list(),
    scrapeRunRepository.listRecent(20),
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
        <CardContent>
          <ScrapeRunsList runs={scrapeRuns} />
        </CardContent>
      </Card>
    </div>
  );
}
