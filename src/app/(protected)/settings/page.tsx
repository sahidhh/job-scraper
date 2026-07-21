import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompaniesTable } from "@/components/settings/CompaniesTable";
import { CompanyFormDialog } from "@/components/settings/CompanyFormDialog";
import { ExperienceCard } from "@/components/settings/ExperienceCard";
import { RankingPreferencesCard } from "@/components/settings/RankingPreferencesCard";
import { SponsorshipCard } from "@/components/settings/SponsorshipCard";
import { ThresholdsCard } from "@/components/settings/ThresholdsCard";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import { SupabaseRankingPreferencesRepository } from "@/features/scoring/infrastructure/SupabaseRankingPreferencesRepository";
import { SupabaseSettingsRepository } from "@/features/settings/infrastructure/SupabaseSettingsRepository";
import { optionalEnv } from "@/shared/infrastructure/env";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

export default async function SettingsSourcesPage() {
  const client = await createSupabaseServerClient();
  const companyRepository = new SupabaseCompanyRepository(client);
  const rankingPreferencesRepository = new SupabaseRankingPreferencesRepository(client);
  const settingsRepository = new SupabaseSettingsRepository(client);

  const [companies, desiredExperience, rankingPreferences, skipUnsponsoredForeignJobs] = await Promise.all([
    companyRepository.list(),
    settingsRepository.getDesiredExperienceYears(),
    rankingPreferencesRepository.getPreferences(),
    settingsRepository.getSkipUnsponsoredForeignJobs(),
  ]);

  const keywordThreshold = optionalEnv("KEYWORD_THRESHOLD", "0.25");
  const notifyThreshold = optionalEnv("NOTIFY_THRESHOLD", "0.75");

  return (
    <section className="space-y-3">
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
      <SponsorshipCard current={skipUnsponsoredForeignJobs} />
      <ThresholdsCard keywordThreshold={keywordThreshold} notifyThreshold={notifyThreshold} />
      <RankingPreferencesCard current={rankingPreferences} />
    </section>
  );
}
