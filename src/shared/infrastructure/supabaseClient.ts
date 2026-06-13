import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../supabase/database.types";
import { requireEnv } from "./env";

export type TypedSupabaseClient = SupabaseClient<Database>;

// Used by scripts/*.ts (decisions.md AD-12) -- the service role key
// bypasses RLS entirely and must never be used in app/ (client-exposed) code.
export function createSupabaseServiceClient(): TypedSupabaseClient {
  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
