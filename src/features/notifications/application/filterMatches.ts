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
  if (!passesExcludedCompanyFilter(match, prefs)) return false;
  if (!passesExcludedKeywordFilter(match, prefs)) return false;
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
  const jobSkills = extractSkills(match.description, SKILLS_DICTIONARY);
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

function passesExcludedCompanyFilter(match: JobMatch, prefs: NotificationPreferences): boolean {
  if (!prefs.excludeCompanies || prefs.excludeCompanies.length === 0) return true;
  const companyLower = match.companyName.toLowerCase();
  return !prefs.excludeCompanies.some((company) => companyLower.includes(company.toLowerCase()));
}

function passesExcludedKeywordFilter(match: JobMatch, prefs: NotificationPreferences): boolean {
  if (!prefs.excludeKeywords || prefs.excludeKeywords.length === 0) return true;
  const titleLower = match.title.toLowerCase();
  return !prefs.excludeKeywords.some((keyword) => titleLower.includes(keyword.toLowerCase()));
}
