import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { requireEnv } from "@/shared/infrastructure/env";
import type { Database } from "../../../../supabase/database.types";

// Cookie-based session client for server components, server actions, and
// route handlers (frontend.md §4). Uses the anon key + RLS
// "authenticated" policy (decisions.md AD-12) -- never the service role key.
export async function createSupabaseServerClient(): Promise<TypedSupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render -- middleware refreshes
            // the session cookie instead, so this can be safely ignored.
          }
        },
      },
    },
  );
}
