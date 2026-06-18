function extractText(e: Record<string, unknown>): string {
  const msg = typeof e.message === "string" ? e.message : "";
  const details = typeof e.details === "string" ? e.details : "";
  const hint = typeof e.hint === "string" ? e.hint : "";
  const code = typeof e.code === "string" ? e.code : "";
  return msg || details || hint || (code ? `Database error (code: ${code})` : "");
}

// Supabase PostgrestError may be a plain object (no Error base class) and may
// omit some fields (details/hint) for certain error types. We avoid requiring
// all four fields so partial error shapes are still unwrapped correctly.
export function toAppError(e: unknown): Error {
  if (e instanceof Error) {
    if (e.message) return e;
    // Error with empty message — try Supabase-specific fields on the same obj.
    const text = extractText(e as unknown as Record<string, unknown>);
    return new Error(text || "Unexpected error.");
  }
  if (typeof e === "object" && e !== null) {
    const text = extractText(e as Record<string, unknown>);
    return new Error(text || "Unexpected error.");
  }
  return new Error("Unexpected error.");
}
