// Role-aware fetching (scrapers.md §2, decisions.md AD-15): when the
// upstream ATS API has no role/keyword query parameter, adapters filter
// fetched jobs client-side by matching `roles` terms against `title`
// (primarily) and `description` (fallback). This is the single shared
// implementation of that match -- adapters must not duplicate it.
//
// Characters that are meaningless/unsafe as substring-match terms (mirrors
// the `,.()%*` set stripped by SupabaseJobRepository's
// `sanitizeRoleForFilter` for the equivalent ILIKE-based match at scoring
// time, jobs/infrastructure/SupabaseJobRepository.ts).
const FILTER_UNSAFE_CHARS = /[,.()%*]/g;

function sanitizeRoleTerm(role: string): string {
  return role.replace(FILTER_UNSAFE_CHARS, "").trim().toLowerCase();
}

// Empty `roles` means "no role filter" -- callers should fetch/keep
// everything (current behavior, preserved for safety per scrapers.md §2).
export function hasRoleFilter(roles: readonly string[]): boolean {
  return roles.some((role) => sanitizeRoleTerm(role).length > 0);
}

// True if `title` or `description` contains any non-empty role term as a
// case-insensitive substring. Used by adapters whose upstream API has no
// role/keyword query parameter (greenhouse/lever/ashby/remoteok/wellfound --
// scrapers.md §2) to filter RawJob[] after fetching.
export function jobMatchesRoles(
  job: { readonly title: string; readonly description: string },
  roles: readonly string[],
): boolean {
  if (!hasRoleFilter(roles)) {
    return true;
  }

  const haystack = `${job.title}\n${job.description}`.toLowerCase();

  return roles.some((role) => {
    const term = sanitizeRoleTerm(role);
    return term.length > 0 && haystack.includes(term);
  });
}
