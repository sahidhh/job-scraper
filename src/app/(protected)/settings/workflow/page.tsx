import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusConfigSection } from "@/components/settings/StatusConfigSection";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

export default async function SettingsWorkflowPage() {
  const client = await createSupabaseServerClient();
  const jobRepository = new SupabaseJobRepository(client);
  const statuses = await jobRepository.listStatuses();

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
    </section>
  );
}
