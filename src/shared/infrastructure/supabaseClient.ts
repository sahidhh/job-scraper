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

// Unauthenticated anon-key client with no session/cookies -- used only to
// verify RLS actually rejects unauthenticated reads (verification
// framework's RLS check). Distinct from the app's session-based server
// client (src/shared/infrastructure/supabase/server.ts), which is always
// authenticated.
export function createSupabaseAnonClient(): TypedSupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false },
  });
}
