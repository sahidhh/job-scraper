import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusConfigSection } from "@/components/settings/StatusConfigSection";
import { StatusDropdownToggleCard } from "@/components/settings/StatusDropdownToggleCard";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseSettingsRepository } from "@/features/settings/infrastructure/SupabaseSettingsRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

export default async function SettingsWorkflowPage() {
  const client = await createSupabaseServerClient();
  const jobRepository = new SupabaseJobRepository(client);
  const settingsRepository = new SupabaseSettingsRepository(client);
  const [statuses, showStatusDropdown] = await Promise.all([
    jobRepository.listStatuses(),
    settingsRepository.getShowStatusDropdown(),
  ]);

  return (
    <section className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Job statuses</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusConfigSection initialStatuses={statuses} />
        </CardContent>
      </Card>
      <StatusDropdownToggleCard current={showStatusDropdown} />
    </section>
  );
}
