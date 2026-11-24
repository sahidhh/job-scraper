// Both runtime contexts (Next.js app, cron scripts) read config from
// process.env directly (decisions.md AD-04) -- this is the one place that
// throws a clear error if a required var is missing.
export function requireEnv(...names: [string, ...string[]]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value.trim().length > 0) {
      return value;
    }
  }
  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

export function hasAnyEnv(...names: [string, ...string[]]): boolean {
  return names.some((name) => {
    const value = process.env[name];
    return value !== undefined && value.trim().length > 0;
  });
}

export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim().length === 0 ? fallback : value;
}
