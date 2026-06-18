function isPostgrestError(
  e: unknown,
): e is { message: string; code: string; details: string; hint: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "message" in e &&
    "code" in e &&
    "details" in e &&
    "hint" in e
  );
}

// Supabase PostgrestError is a plain object, not an Error instance.
// Throwing it directly loses the message on the Next.js error boundary.
// Always throw the result of this function instead of the raw error.
export function toAppError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (isPostgrestError(e)) {
    const msg = e.message || e.details || e.hint || `Database error (code: ${e.code})`;
    return new Error(msg);
  }
  return new Error("Unexpected error.");
}
