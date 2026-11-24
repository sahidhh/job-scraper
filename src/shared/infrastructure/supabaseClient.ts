import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../supabase/database.types";
import { requireEnv } from "./env";
import { requireSupabasePublishableKey } from "./supabase/env";

export type TypedSupabaseClient = SupabaseClient<Database>;

export const SUPABASE_SECRET_KEY_ENV_VARS = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

// Used by scripts/*.ts (decisions.md AD-12) -- the secret / service-role key
// bypasses RLS entirely and must never be used in app/ (client-exposed) code.
export function createSupabaseServiceClient(): TypedSupabaseClient {
  const url = requireEnv("SUPABASE_URL");
  const secretKey = requireEnv(...SUPABASE_SECRET_KEY_ENV_VARS);

  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false },
  });
}

// Unauthenticated publishable/anon-key client with no session/cookies -- used only to
// verify RLS actually rejects unauthenticated reads (verification
// framework's RLS check). Distinct from the app's session-based server
// client (src/shared/infrastructure/supabase/server.ts), which is always
// authenticated.
export function createSupabaseAnonClient(): TypedSupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = requireSupabasePublishableKey();

  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false },
  });
}
