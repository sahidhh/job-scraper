import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeJobsByCompany } from "@/features/insights/application/computeJobsByCompany";
import { computeJobsByExperience } from "@/features/insights/application/computeJobsByExperience";
import { computeJobsByLocation } from "@/features/insights/application/computeJobsByLocation";
import { computeRemoteStats } from "@/features/insights/application/computeRemoteStats";
import { computeSalaryStats } from "@/features/insights/application/computeSalaryStats";
import { SupabaseMatchedJobsRepository } from "@/features/insights/infrastructure/SupabaseMatchedJobsRepository";
import {
  JobsByCompanyChart,
  JobsByExperienceChart,
  JobsByLocationChart,
  RemoteStatCard,
  SalaryStatsCards,
  StatusBreakdownChart,
} from "@/features/insights/ui/AnalyticsCharts";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

export default async function AnalyticsBreakdownPage() {
  const client = await createSupabaseServerClient();
  const repo = new SupabaseMatchedJobsRepository(client);

  const [statusBreakdown, experienceData, locationData, companyData, salaryData] = await Promise.all([
    repo.getStatusBreakdown(),
    repo.getJobsExperienceData(),
    repo.getJobsLocationData(),
    repo.getJobsCompanyData(),
    repo.getJobsSalaryData(),
  ]);

  const byExperience = computeJobsByExperience(experienceData);
  const byLocation = computeJobsByLocation(locationData);
  const byCompany = computeJobsByCompany(companyData);
  const salaryStats = computeSalaryStats(salaryData);
  const remoteStats = computeRemoteStats(locationData);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Job breakdown</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Status</CardTitle></CardHeader>
            <CardContent><StatusBreakdownChart data={statusBreakdown} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Experience required</CardTitle></CardHeader>
            <CardContent><JobsByExperienceChart data={byExperience} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Location</CardTitle></CardHeader>
            <CardContent><JobsByLocationChart data={byLocation} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Company</CardTitle></CardHeader>
            <CardContent><JobsByCompanyChart data={byCompany} /></CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Job metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RemoteStatCard stats={remoteStats} />
        </div>
        <SalaryStatsCards data={salaryStats} />
      </section>
    </div>
  );
}
