import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";
import { checkRequiredVar, checkOptionalVar, type EnvCheckResult } from "@/shared/infrastructure/envCheck";
import { checkSupabaseConnectivity, checkTelegramToken } from "@/shared/infrastructure/connectivityCheck";

// Environment/connectivity check (Phase 7 dev-experience polish) -- run
// this before wiring up cron secrets or after rotating a key, to catch a
// missing/misconfigured var locally instead of via a failed GitHub Actions
// run. Read-only: makes one lightweight Supabase query and one Telegram
// getMe call, never touches job data.
const ICON: Record<EnvCheckResult["status"], string> = { pass: "✓", warn: "⚠", fail: "✗" };

function printResults(section: string, results: EnvCheckResult[]): void {
  console.log(`\n${section}`);
  for (const r of results) {
    console.log(`  ${ICON[r.status]} ${r.label.padEnd(28)} ${r.detail}`);
  }
}

async function main(): Promise<void> {
  console.log("job-scraper doctor — environment & connectivity check\n");
  console.log("=".repeat(70));

  const cronRequired = [
    checkRequiredVar("SUPABASE_URL"),
    checkRequiredVar("SUPABASE_SERVICE_ROLE_KEY"),
    checkRequiredVar("OPENROUTER_API_KEY"),
    checkRequiredVar("OPENROUTER_MODEL"),
    checkRequiredVar("TELEGRAM_BOT_TOKEN"),
    checkRequiredVar("TELEGRAM_CHAT_ID"),
  ];
  printResults("Cron pipeline (scrape/score/notify) — required", cronRequired);

  const webRequired = [checkRequiredVar("NEXT_PUBLIC_SUPABASE_URL"), checkRequiredVar("NEXT_PUBLIC_SUPABASE_ANON_KEY")];
  printResults("Web app — required", webRequired);

  const optional = [
    checkOptionalVar("KEYWORD_THRESHOLD", "defaults to 0.25"),
    checkOptionalVar("NOTIFY_THRESHOLD", "defaults to 0.75"),
    checkOptionalVar("NOTIFY_MODE", "defaults to individual"),
    checkOptionalVar("APP_URL", "digest \"open dashboard\" links will be omitted"),
    checkOptionalVar("WELLFOUND_FEED_URL", "Wellfound adapter auto-disables"),
  ];
  printResults("Optional (deliberate defaults exist)", optional);

  const connectivity: EnvCheckResult[] = [];
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    connectivity.push(await checkSupabaseConnectivity(createSupabaseServiceClient()));
  } else {
    connectivity.push({ status: "warn", label: "Supabase connectivity", detail: "skipped — required vars missing above" });
  }
  connectivity.push(await checkTelegramToken());
  printResults("Connectivity", connectivity);

  const all = [...cronRequired, ...webRequired, ...optional, ...connectivity];
  const failCount = all.filter((r) => r.status === "fail").length;
  const warnCount = all.filter((r) => r.status === "warn").length;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`${failCount} failing, ${warnCount} warning(s).`);

  if (failCount > 0) {
    console.log("\nFix the ✗ items above before running scrape/score/notify.");
    process.exit(1);
  }
  console.log("\nAll required checks passed.");
}

main().catch((err) => {
  console.error("[doctor] fatal error:", err);
  process.exit(1);
});
