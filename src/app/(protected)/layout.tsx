import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

// Defense-in-depth re-check alongside middleware (frontend.md §4.2).
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  return <AppShell>{children}</AppShell>;
}
