// Both runtime contexts (Next.js app, cron scripts) read config from
// process.env directly (decisions.md AD-04) -- this is the one place that
// throws a clear error if a required var is missing.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim().length === 0 ? fallback : value;
}
