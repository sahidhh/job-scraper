import { NotificationPreferencesCard } from "@/components/settings/NotificationPreferencesCard";
import { SupabaseNotificationPreferencesRepository } from "@/features/notifications/infrastructure/SupabaseNotificationPreferencesRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Notifications · Settings" };

export default async function SettingsNotificationsPage() {
  const client = await createSupabaseServerClient();
  const notificationPreferencesRepository = new SupabaseNotificationPreferencesRepository(client);
  const notificationPreferences = await notificationPreferencesRepository.getPreferences();

  return (
    <section className="space-y-3">
      <NotificationPreferencesCard current={notificationPreferences} />
    </section>
  );
}
