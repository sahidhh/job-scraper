// Shared by resume skill extraction and job keyword scoring
// (scoring.md §1-2) -- the single point of truth for "what counts as a
// skill". The dictionary contents themselves are config data
// (shared/config), not domain state.
export interface SkillDictionaryEntry {
  canonical: string;
  aliases: readonly string[];
}

// Matches each dictionary entry's aliases against `text` (case-insensitive,
// whole-word/whole-token -- so "react" doesn't match inside "reactive", but
// "Node.js"/".NET"/"C#" style aliases with punctuation still match).
// Returns canonical names, deduped, in dictionary order.
export function extractSkills(
  text: string,
  dictionary: readonly SkillDictionaryEntry[],
): string[] {
  const lowerText = text.toLowerCase();
  const found: string[] = [];

  for (const entry of dictionary) {
    const matched = entry.aliases.some((alias) => containsToken(lowerText, alias.toLowerCase()));
    if (matched) {
      found.push(entry.canonical);
    }
  }

  return found;
}

// Exported for reuse anywhere else "does this text contain X as a whole
// word/token, not a substring of something else" is needed (e.g.
// classifyEligibility.ts's remote-country-lock detection) -- same
// word-boundary rule, no need to re-derive it per caller.
export function containsToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // [a-z0-9+#] excludes +/# so "c" won't match inside "c++" or "c#"
  const pattern = new RegExp(`(?<![a-z0-9+#])${escaped}(?![a-z0-9+#])`, "i");
  return pattern.test(text);
}
