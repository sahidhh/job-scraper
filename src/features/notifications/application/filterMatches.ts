import type { SkillDictionaryEntry } from "@/shared/domain/skills";
import { SKILLS_DICTIONARY } from "@/shared/config/skills-dictionary";
import { extractSkills } from "@/shared/domain/skills";
import type { JobMatch, NotificationPreferences } from "@/features/notifications/domain/types";

// Applies include-only filters to the given matches. All specified filters
// must pass (AND); within each filter any single entry passes (OR).
// Absent or empty-array fields are treated as "no filter" (all pass).
// This preserves existing notification behaviour when no preferences are set.
export function filterMatches(matches: JobMatch[], prefs: NotificationPreferences): JobMatch[] {
  return matches.filter((match) => passesAllFilters(match, prefs));
}

function passesAllFilters(match: JobMatch, prefs: NotificationPreferences): boolean {
  if (!passesRoleFilter(match, prefs)) return false;
  if (!passesSkillFilter(match, prefs)) return false;
  if (!passesLocationFilter(match, prefs)) return false;
  if (!passesExperienceFilter(match, prefs)) return false;
  if (!passesSourceFilter(match, prefs)) return false;
  if (!passesBlockedCompanyFilter(match, prefs)) return false;
  if (!passesEmploymentTypeFilter(match, prefs)) return false;
  return true;
}

function passesRoleFilter(match: JobMatch, prefs: NotificationPreferences): boolean {
  if (!prefs.roles || prefs.roles.length === 0) return true;
  const titleLower = match.title.toLowerCase();
  return prefs.roles.some((role) => titleLower.includes(role.toLowerCase()));
}

// Resolves a user-supplied skill name (canonical or alias) to the dictionary
// canonical so it can be compared against extractSkills() output.
function resolveSkillToCanonical(skill: string, dictionary: readonly SkillDictionaryEntry[]): string {
  const lower = skill.toLowerCase();
  for (const entry of dictionary) {
    if (entry.canonical.toLowerCase() === lower) return entry.canonical;
    if (entry.aliases.some((a) => a.toLowerCase() === lower)) return entry.canonical;
  }
  return skill;
}

function passesSkillFilter(match: JobMatch, prefs: NotificationPreferences): boolean {
  if (!prefs.skills || prefs.skills.length === 0) return true;
  // Must match scoreJob.ts's text source (title+description) -- a job that
  // scores highly on a title-only skill mention (e.g. "React Developer")
  // would otherwise be silently filtered out here despite matching scoring.
  const jobSkills = extractSkills(`${match.title}\n${match.description}`, SKILLS_DICTIONARY);
  const jobSkillsLower = new Set(jobSkills.map((s) => s.toLowerCase()));
  return prefs.skills.some((skill) => {
    const canonical = resolveSkillToCanonical(skill, SKILLS_DICTIONARY);
    return jobSkillsLower.has(canonical.toLowerCase());
  });
}

function passesLocationFilter(match: JobMatch, prefs: NotificationPreferences): boolean {
  if (!prefs.locations || prefs.locations.length === 0) return true;
  return prefs.locations.some((loc) => match.locationTags.includes(loc));
}

// null minYears means the job did not specify experience — always passes.
function passesExperienceFilter(match: JobMatch, prefs: NotificationPreferences): boolean {
  if (match.minYears === null) return true;
  if (prefs.minExperience !== undefined && match.minYears < prefs.minExperience) return false;
  if (prefs.maxExperience !== undefined && match.minYears > prefs.maxExperience) return false;
  return true;
}

function passesSourceFilter(match: JobMatch, prefs: NotificationPreferences): boolean {
  if (!prefs.sources || prefs.sources.length === 0) return true;
  return prefs.sources.includes(match.source);
}

function passesBlockedCompanyFilter(match: JobMatch, prefs: NotificationPreferences): boolean {
  if (!prefs.blockedCompanies || prefs.blockedCompanies.length === 0) return true;
  const companyLower = match.companyName.toLowerCase();
  return !prefs.blockedCompanies.some((blocked) => companyLower.includes(blocked.toLowerCase()));
}

// null employmentType (unrecognized/unstated) always passes -- excluding by
// a type we couldn't determine would silently hide jobs the user never
// asked to exclude.
function passesEmploymentTypeFilter(match: JobMatch, prefs: NotificationPreferences): boolean {
  if (!prefs.excludeEmploymentTypes || prefs.excludeEmploymentTypes.length === 0) return true;
  if (match.employmentType === null) return true;
  return !prefs.excludeEmploymentTypes.includes(match.employmentType);
}
