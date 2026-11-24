import { hasAnyEnv, requireEnv } from "@/shared/infrastructure/env";

export const SUPABASE_PUBLISHABLE_KEY_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export function requireSupabasePublishableKey(): string {
  return requireEnv(...SUPABASE_PUBLISHABLE_KEY_ENV_VARS);
}

export function hasSupabasePublishableKey(): boolean {
  return hasAnyEnv(...SUPABASE_PUBLISHABLE_KEY_ENV_VARS);
}
