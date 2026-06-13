import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// security-audit.md #3 / post-merge-audit.md P3 -- SUPABASE_SERVICE_ROLE_KEY
// and createSupabaseServiceClient() bypass RLS (AD-12) and must stay out of
// client-reachable code. Run via `npm run check:service-role-boundary`.
const ROOT = process.cwd();
const SCAN_DIRS = ["src", "scripts"];
const PATTERNS = ["SUPABASE_SERVICE_ROLE_KEY", "createSupabaseServiceClient"];
const ALLOWED_FILES = new Set(["src/shared/infrastructure/supabaseClient.ts"]);
const ALLOWED_PREFIX = "scripts/";
const EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIP_DIRS = new Set(["node_modules", ".next"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) {
      out.push(full);
    }
  }
  return out;
}

const violations: string[] = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).split("\\").join("/");
    if (rel.startsWith(ALLOWED_PREFIX) || ALLOWED_FILES.has(rel)) continue;

    const content = readFileSync(file, "utf8");
    for (const pattern of PATTERNS) {
      if (content.includes(pattern)) {
        violations.push(`${rel}: contains "${pattern}"`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Service-role key boundary violation(s) found:");
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error(
    '\n"SUPABASE_SERVICE_ROLE_KEY" and "createSupabaseServiceClient" may only appear under scripts/** or src/shared/infrastructure/supabaseClient.ts.',
  );
  process.exit(1);
}

console.log("Service-role key boundary check passed.");
