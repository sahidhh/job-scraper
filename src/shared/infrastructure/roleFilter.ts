// Builds a PostgREST `.or()` filter that matches a job's title OR description
// against any of the expanded role terms (decisions.md AD-15). Lives in
// `shared/infrastructure` so both the jobs repository and the insights
// repository can use it without crossing the "no feature imports another
// feature's infrastructure" rule (architecture.md §5 rule 5).

// PostgREST .or() filter syntax treats `,`, `.`, `(`, `)` as structural and
// `%`/`*` as wildcards -- strip them from role strings (which may originate
// from AI-expanded roles, scraper-audit.md #1) before interpolating into
// `title.ilike.%...%` clauses.
const FILTER_UNSAFE_CHARS = /[,.()%*]/g;

export function sanitizeRoleForFilter(role: string): string {
  return role.replace(FILTER_UNSAFE_CHARS, "").trim();
}

// Returns a PostgREST .or() filter matching title OR description against any
// expandedRoles term, or null if no usable terms remain after sanitizing.
export function buildRoleFilter(expandedRoles: readonly string[]): string | null {
  const sanitizedRoles = expandedRoles.map(sanitizeRoleForFilter).filter((role) => role.length > 0);
  if (sanitizedRoles.length === 0) return null;

  return sanitizedRoles.flatMap((role) => [`title.ilike.%${role}%`, `description.ilike.%${role}%`]).join(",");
}
