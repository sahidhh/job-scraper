import { TITLE_ALLOWLIST, TITLE_DENYLIST } from "@/shared/config/candidate-constraints";

// Role-aware fetching (scrapers.md §2, decisions.md AD-15): when the
// upstream ATS API has no role/keyword query parameter, adapters filter
// fetched jobs client-side by matching `roles` terms against `title` ONLY
// (never `description`).
//
// Characters that are meaningless/unsafe as substring-match terms.
// `.` is intentionally preserved so tech tokens like `.net` do not become
// `net` and false-match `Kubernetes` or `Network`.
const FILTER_UNSAFE_CHARS = /[,()%*]/g;

function sanitizeRoleTerm(role: string): string {
  return role.replace(FILTER_UNSAFE_CHARS, "").trim().toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleMatchesDenylistTerm(titleLower: string, term: string): boolean {
  const escaped = escapeRegExp(term.toLowerCase());
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`);
  return pattern.test(titleLower);
}

// Empty `roles` means "no role filter" -- callers should fetch/keep
// everything (current behavior, preserved for safety per scrapers.md §2).
export function hasRoleFilter(roles: readonly string[]): boolean {
  return roles.some((role) => sanitizeRoleTerm(role).length > 0);
}

// True if `title` does not match any TITLE_DENYLIST term (token-safe) AND
// matches any non-empty role term or TITLE_ALLOWLIST term as a case-insensitive
// substring. Never inspects `description`.
export function jobMatchesRoles(
  job: { readonly title: string; readonly description?: string },
  roles: readonly string[],
): boolean {
  const titleLower = job.title.toLowerCase();

  if (TITLE_DENYLIST.some((term) => titleMatchesDenylistTerm(titleLower, term))) {
    return false;
  }

  if (!hasRoleFilter(roles)) {
    return true;
  }

  const matchesExplicitRole = roles.some((role) => {
    const term = sanitizeRoleTerm(role);
    return term.length > 0 && titleLower.includes(term);
  });

  if (matchesExplicitRole) {
    return true;
  }

  return TITLE_ALLOWLIST.some((term) => titleLower.includes(term));
}
