import { createHash } from "node:crypto";

// Stable cache key for the sha256 parse-once cache (decisions.md AD-30) --
// mirrors jobhunt-app's jobhunt/extract.py::file_hash, hashing the raw file
// bytes rather than the parsed text so identical uploads hit the cache
// before any parsing work happens.
export function computeContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
