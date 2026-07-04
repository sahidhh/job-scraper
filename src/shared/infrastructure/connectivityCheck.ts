// Shared lightweight connectivity probes, extracted from scripts/doctor.ts
// so the verification framework (src/features/verification) can reuse the
// exact same checks instead of duplicating them.
import type { TypedSupabaseClient } from "./supabaseClient";
import type { EnvCheckResult } from "./envCheck";

export async function checkSupabaseConnectivity(client: TypedSupabaseClient): Promise<EnvCheckResult> {
  try {
    const { error } = await client.from("app_settings").select("key", { count: "exact", head: true });
    if (error) return { status: "fail", label: "Supabase connectivity", detail: error.message };
    return { status: "pass", label: "Supabase connectivity", detail: "query succeeded" };
  } catch (err) {
    return { status: "fail", label: "Supabase connectivity", detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkTelegramToken(): Promise<EnvCheckResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { status: "warn", label: "Telegram bot token", detail: "TELEGRAM_BOT_TOKEN not set — skipped" };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = (await response.json()) as { ok: boolean; description?: string };
    if (!response.ok || !body.ok) {
      return { status: "fail", label: "Telegram bot token", detail: body.description ?? `HTTP ${response.status}` };
    }
    return { status: "pass", label: "Telegram bot token", detail: "getMe succeeded" };
  } catch (err) {
    return { status: "fail", label: "Telegram bot token", detail: err instanceof Error ? err.message : String(err) };
  }
}
