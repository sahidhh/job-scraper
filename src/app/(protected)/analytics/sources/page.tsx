import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import { ScrapeRunHealthTable } from "@/features/insights/ui/ScrapeRunHealthTable";
import { SourceHealthTable } from "@/features/insights/ui/SourceHealthTable";
import { getSourceHealthReport } from "@/features/sources/application/getSourceHealthReport";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

export default async function AnalyticsSourcesPage() {
  const client = await createSupabaseServerClient();
  const companyRepo = new SupabaseCompanyRepository(client);
  const scrapeRunRepository = new SupabaseScrapeRunRepository(client);

  const [companies, sourceHealthReport] = await Promise.all([
    companyRepo.list(),
    getSourceHealthReport(scrapeRunRepository),
  ]);

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Source health</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Probe-based</CardTitle></CardHeader>
          <CardContent><SourceHealthTable companies={companies} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Scrape-based (all sources)</CardTitle></CardHeader>
          <CardContent><ScrapeRunHealthTable summaries={sourceHealthReport} /></CardContent>
        </Card>
      </div>
    </section>
  );
}
