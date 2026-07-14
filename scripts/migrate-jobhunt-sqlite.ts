import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, resolve } from "node:path";
import { tagLocations } from "@/features/filtering/application/tagLocations";
import { hasAllowedLocation } from "@/features/filtering/domain/validation";
import { ingestJobs } from "@/features/jobs/application/ingestJobs";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseNotificationRepository } from "@/features/notifications/infrastructure/SupabaseNotificationRepository";
import { computeContentHash } from "@/features/resume/infrastructure/contentHash";
import {
  RESUME_FILE_EXTENSION_BY_MIME_TYPE,
  type SupportedResumeMimeType,
} from "@/features/resume/infrastructure/parseResumeFile";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import type { RawJob } from "@/features/sources/domain/types";
import { SKILLS_DICTIONARY } from "@/shared/config/skills-dictionary";
import type { JobSource } from "@/shared/domain/enums";
import { extractSkills } from "@/shared/domain/skills";
import { createSupabaseServiceClient, type TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";

const RESUME_BUCKET = "resumes";

// jobhunt-app's own status vocabulary (jobhunt/db.py's `jobs.status`,
// app.py's status selectbox) -- 'new' means the user never reviewed the
// job there, so nothing to migrate; the other three mean they did.
const SEEN_STATUSES = new Set(["drafted", "applied", "skipped"]);

// jobhunt/sources.py's two source tags -> this app's JobSource enum
// (docs/decisions.md AD-35: careers_url is a valid JobSource).
const JOBHUNT_SOURCE_MAP: Record<string, JobSource> = {
  jsearch: "jsearch",
  careers: "careers_url",
};

const EXTENSION_TO_MIME_TYPE: Record<string, SupportedResumeMimeType> = Object.fromEntries(
  Object.entries(RESUME_FILE_EXTENSION_BY_MIME_TYPE).map(([mimeType, ext]) => [ext, mimeType as SupportedResumeMimeType]),
);

interface JobhuntResumeRow {
  id: number;
  name: string;
  file_path: string | null;
  raw_text: string | null;
  working_text: string | null;
  created_at: number;
}

interface JobhuntJobRow {
  id: number;
  job_id: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  description: string | null;
  url: string | null;
  source: string | null;
  status: string;
}

// jobhunt-app stores resumes.file_path relative to its own CWD (app.py's
// DATA_DIR = "data", not relative to the sqlite file itself, which lives at
// data/jobhunt.db) -- so a straight resolve(dirname(dbPath), filePath)
// would double up the "data/" segment. Try the project root implied by the
// db's own location first (parent of a "data" dir), then fall back to the
// db's directory for any other layout the operator points this at.
function resolveLegacyFilePath(dbPath: string, filePath: string): string {
  if (isAbsolute(filePath)) return filePath;

  const dbDir = dirname(dbPath);
  const projectRoot = basename(dbDir) === "data" ? dirname(dbDir) : dbDir;
  const candidates = [resolve(projectRoot, filePath), resolve(dbDir, filePath)];
  return candidates.find(existsSync) ?? candidates[0]!;
}

// Migrates every resume, oldest first, via the same atomic
// set_active_resume path uploadResume() uses -- each call creates a new
// version row (decisions.md AD-30: versioning is unconditional, cache hit
// or miss), so the most-recently-created jobhunt resume ends up active,
// same as it would have been the most recently used one there.
async function migrateResumes(db: DatabaseSync, dbPath: string, client: TypedSupabaseClient): Promise<void> {
  const resumeRepository = new SupabaseResumeRepository(client);
  const rows = db
    .prepare("SELECT id, name, file_path, raw_text, working_text, created_at FROM resumes ORDER BY created_at ASC")
    .all() as unknown as JobhuntResumeRow[];

  let migrated = 0;
  for (const row of rows) {
    const text = (row.working_text || row.raw_text || "").trim();
    if (!text) {
      console.warn(`[migrate-jobhunt-sqlite] resume ${row.id} (${row.name}): no extracted text, skipping`);
      continue;
    }

    let filePath = `legacy-jobhunt/resume-${row.id}.txt`;
    let contentHash: string | null = null;

    if (row.file_path) {
      const resolvedPath = resolveLegacyFilePath(dbPath, row.file_path);
      const ext = extname(resolvedPath).slice(1).toLowerCase();
      const mimeType = EXTENSION_TO_MIME_TYPE[ext];

      if (!existsSync(resolvedPath)) {
        console.warn(`[migrate-jobhunt-sqlite] resume ${row.id}: original file not found at ${resolvedPath}, migrating text only`);
      } else if (!mimeType) {
        console.warn(`[migrate-jobhunt-sqlite] resume ${row.id}: unsupported file type .${ext} (only pdf/docx have Storage), migrating text only`);
      } else {
        const buffer = readFileSync(resolvedPath);
        const hash = computeContentHash(buffer);
        const { error } = await client.storage.from(RESUME_BUCKET).upload(`${hash}.${ext}`, buffer, {
          contentType: mimeType,
          upsert: true,
        });
        if (error) {
          console.warn(`[migrate-jobhunt-sqlite] resume ${row.id}: storage upload failed (${error.message}), migrating text only`);
        } else {
          filePath = `${hash}.${ext}`;
          contentHash = hash;
        }
      }
    }

    const skills = extractSkills(text, SKILLS_DICTIONARY);
    await resumeRepository.create({ filePath, parsedText: text, skills, contentHash });
    migrated += 1;
  }

  console.log(`[migrate-jobhunt-sqlite] resumes: migrated ${migrated}/${rows.length}`);
}

// Migrates only jobs the user already reviewed in jobhunt-app (status !=
// 'new') through the standard tagLocations -> hasAllowedLocation ->
// ingestJobs pipeline (same as scrape.ts/scrape-careers-url.ts), then marks
// each as already notified so this app's digest never re-surfaces
// something the user already drafted/applied/skipped there. 'new' rows
// were never reviewed and carry nothing worth migrating -- if the scraper
// rediscovers them here, they should notify normally.
async function migrateSeenJobs(db: DatabaseSync, client: TypedSupabaseClient): Promise<void> {
  const jobRepository = new SupabaseJobRepository(client);
  const notificationRepository = new SupabaseNotificationRepository(client);

  const allRows = db
    .prepare("SELECT id, job_id, title, company, location, description, url, source, status FROM jobs")
    .all() as unknown as JobhuntJobRow[];
  const seenRows = allRows.filter((row) => SEEN_STATUSES.has(row.status));

  const rawJobs: RawJob[] = [];
  let skipped = 0;
  for (const row of seenRows) {
    const source = row.source ? JOBHUNT_SOURCE_MAP[row.source] : undefined;
    if (!source || !row.job_id || !row.title || !row.url) {
      skipped += 1;
      continue;
    }
    rawJobs.push({
      source,
      sourceJobId: row.job_id,
      companyId: null,
      companyName: row.company ?? "",
      title: row.title,
      locationRaw: row.location ?? "",
      description: row.description ?? "",
      url: row.url,
      postedAt: null,
    });
  }

  if (skipped > 0) {
    console.warn(`[migrate-jobhunt-sqlite] seen jobs: skipped ${skipped} row(s) missing a recognized source/id/title/url`);
  }

  const tagged = tagLocations(rawJobs);
  const filtered = tagged.filter((job) => hasAllowedLocation(job.locationTags));

  const result = filtered.length > 0 ? await ingestJobs(filtered, { jobRepository }) : { inserted: 0, updated: 0, duplicates: 0 };
  console.log(
    `[migrate-jobhunt-sqlite] seen jobs: ${seenRows.length} seen in jobhunt, ${rawJobs.length} recognized, ` +
      `${filtered.length} kept after location filter, inserted ${result.inserted}, updated ${result.updated}, duplicates ${result.duplicates}`,
  );

  if (filtered.length === 0) return;

  const idsBySource = new Map<JobSource, string[]>();
  for (const job of filtered) {
    const ids = idsBySource.get(job.source) ?? [];
    ids.push(job.sourceJobId);
    idsBySource.set(job.source, ids);
  }

  const jobIds: string[] = [];
  for (const [source, sourceJobIds] of idsBySource) {
    const { data, error } = await client.from("jobs").select("id").eq("source", source).in("source_job_id", sourceJobIds);
    if (error) throw error;
    for (const row of data ?? []) jobIds.push(row.id);
  }

  await notificationRepository.markManyNotified(jobIds);
  console.log(`[migrate-jobhunt-sqlite] seen jobs: marked ${jobIds.length} as already notified`);
}

// One-time cutover for merge-workspace Phase 6 (sunset jobhunt-app):
//   npm run migrate:jobhunt-sqlite -- <path-to-jobhunt.db>
// Not idempotent for resumes (every call creates a new version row, by
// design -- see migrateResumes' comment); safe to re-run for jobs (upsert +
// notifications_log are both already idempotent).
async function main(): Promise<void> {
  const dbPathArg = process.argv[2];
  if (!dbPathArg) {
    console.error("[migrate-jobhunt-sqlite] usage: npm run migrate:jobhunt-sqlite -- <path-to-jobhunt.db>");
    process.exit(1);
  }

  const dbPath = resolve(dbPathArg);
  if (!existsSync(dbPath)) {
    console.error(`[migrate-jobhunt-sqlite] file not found: ${dbPath}`);
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  const client = createSupabaseServiceClient();

  try {
    await migrateResumes(db, dbPath, client);
    await migrateSeenJobs(db, client);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("[migrate-jobhunt-sqlite] fatal error:", err);
  process.exit(1);
});
