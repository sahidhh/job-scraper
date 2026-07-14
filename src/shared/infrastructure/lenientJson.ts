// One shared lenient-JSON parser (Phase 0 finding: don't duplicate this per
// feature). LLM text completions sometimes wrap JSON in markdown code
// fences, or add stray prose before/after the payload (jobhunt/enhance.py's
// `suggest()` hits this in practice). Strips fences and parses; on failure,
// falls back to extracting the first balanced array/object substring.
// Never throws -- returns null so callers treat "unparseable" the same as
// "the AI call failed".
export function parseLenientJson<T>(raw: string): T | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(stripped) as T;
  } catch {
    const match = stripped.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}
