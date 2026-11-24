import { readFile } from "node:fs/promises";
import path from "node:path";
import { SourceAuthExpiredError } from "@/features/sources/domain/errors";
import type { JobSource } from "@/shared/domain/enums";

interface JsonCookie {
  name?: unknown;
  value?: unknown;
}

export function resolveCookieFilePath(
  source: Extract<JobSource, "naukri" | "naukrigulf">,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const specific = source === "naukri" ? env.NAUKRI_COOKIE_FILE : env.NAUKRIGULF_COOKIE_FILE;
  if (specific && specific.trim().length > 0) {
    return path.resolve(specific.trim());
  }
  const cookiesDir = env.COOKIES_DIR && env.COOKIES_DIR.trim().length > 0 ? env.COOKIES_DIR.trim() : ".cookies";
  return path.resolve(cookiesDir, `${source}.json`);
}

export function parseCookieStoreContent(
  raw: string,
  source: Extract<JobSource, "naukri" | "naukrigulf">,
): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new SourceAuthExpiredError(source, undefined, "Cookie store file is empty");
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new SourceAuthExpiredError(source, undefined, "Cookie store JSON is malformed");
    }

    if (!Array.isArray(parsed)) {
      throw new SourceAuthExpiredError(source, undefined, "Cookie store JSON must be an array of {name, value}");
    }

    const pairs = parsed
      .filter((item): item is JsonCookie => typeof item === "object" && item !== null)
      .filter((item) => typeof item.name === "string" && item.name.length > 0 && typeof item.value === "string")
      .map((item) => `${item.name}=${item.value}`);

    if (pairs.length === 0) {
      throw new SourceAuthExpiredError(source, undefined, "Cookie store JSON contains no valid cookies");
    }

    return pairs.join("; ");
  }

  return trimmed;
}

export async function readSourceCookieHeader(
  source: Extract<JobSource, "naukri" | "naukrigulf">,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const filePath = resolveCookieFilePath(source, env);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    throw new SourceAuthExpiredError(
      source,
      undefined,
      `Unable to read cookie store at ${filePath}${code ? ` (${code})` : ""}`,
    );
  }

  return parseCookieStoreContent(raw, source);
}
