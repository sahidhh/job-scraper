export type EmploymentType = "internship" | "contract" | "freelance" | "temporary" | "part_time" | "full_time";
export type SeniorityLevel = "executive" | "principal" | "lead" | "senior" | "entry" | "mid";
export type WorkArrangement = "hybrid" | "onsite";

export const EMPLOYMENT_TYPES: readonly EmploymentType[] = [
  "internship",
  "contract",
  "freelance",
  "temporary",
  "part_time",
  "full_time",
];

export interface JobAttributes {
  employmentType: EmploymentType | null;
  seniority: SeniorityLevel | null;
  // "remote" is already covered by LocationTag (tagLocations.ts) -- this
  // only distinguishes hybrid vs fully-onsite for non-remote postings.
  workArrangement: WorkArrangement | null;
  // null = not mentioned; true = explicitly offered; false = explicitly
  // ruled out (mirrors extractSalary's "no figure given" tri-state).
  visaSponsorship: boolean | null;
  relocationAssistance: boolean | null;
  securityClearance: boolean;
  urgentHiring: boolean;
}

// Each list is checked in order -- first match wins, so more specific
// signals must precede more general ones (e.g. an "internship" posting
// that also says "full-time" should classify as internship, not full_time).
const EMPLOYMENT_TYPE_PATTERNS: [EmploymentType, RegExp][] = [
  ["internship", /\b(intern|interns|internship|internships)\b/i],
  ["contract", /\b(contract|contractor|contract-to-hire|c2h)\b/i],
  ["freelance", /\b(freelance|freelancer)\b/i],
  ["temporary", /\b(temporary|temp position|seasonal)\b/i],
  ["part_time", /\bpart[- ]time\b/i],
  ["full_time", /\bfull[- ]time\b/i],
];

const SENIORITY_PATTERNS: [SeniorityLevel, RegExp][] = [
  ["executive", /\b(chief|cto|ceo|cfo|coo|vp|vice president|head of|director)\b/i],
  ["principal", /\b(principal|staff engineer|staff software|distinguished engineer)\b/i],
  ["lead", /\b(tech lead|team lead|engineering lead|lead engineer|lead developer)\b/i],
  ["senior", /\b(senior|sr\.?)\b/i],
  ["entry", /\b(entry[- ]level|junior|jr\.?|fresher|new grad|graduate program)\b/i],
  ["mid", /\b(mid[- ]level|mid[- ]senior|intermediate)\b/i],
];

const WORK_ARRANGEMENT_PATTERNS: [WorkArrangement, RegExp][] = [
  ["hybrid", /\bhybrid\b/i],
  ["onsite", /\b(on-site|onsite|on site|in-office|in office)\b/i],
];

const VISA_NEGATIVE = /\b(no visa sponsorship|unable to sponsor|does not sponsor|cannot sponsor|not able to sponsor)\b|\bvisa sponsorship (?:is )?not (?:available|provided|offered)\b/i;
const VISA_POSITIVE = /\bvisa sponsorship\b|\bsponsors? (?:a |an )?visa\b|\bwill sponsor\b|\bh-?1b sponsorship\b|\bsponsorship available\b|\bopen to sponsor(?:ship)?\b/i;

const RELOCATION_NEGATIVE = /\bno relocation assistance\b|\brelocation (?:is )?not (?:provided|available|offered)\b/i;
const RELOCATION_POSITIVE = /\brelocation (?:assistance|package|support|provided|bonus)\b|\bwill relocate you\b/i;

const SECURITY_CLEARANCE_PATTERN = /\bsecurity clearance\b|\bactive clearance\b|\bts\/sci\b|\btop secret clearance\b|\bsecret clearance\b|\bclearance required\b/i;

const URGENT_HIRING_PATTERN = /\burgent(?:ly)? hiring\b|\bimmediate joiners?\b|\bhiring immediately\b|\bimmediate start\b|\burgently required\b|\bapply immediately\b/i;

function firstMatch<T extends string>(text: string, patterns: [T, RegExp][]): T | null {
  for (const [value, pattern] of patterns) {
    if (pattern.test(text)) return value;
  }
  return null;
}

function tristate(text: string, negative: RegExp, positive: RegExp): boolean | null {
  if (negative.test(text)) return false;
  if (positive.test(text)) return true;
  return null;
}

/**
 * Extracts deterministic job attributes (Phase 2, personal-intelligence
 * polish) from posting title+description text. Regex-only, no AI --
 * mirrors extractSalary.ts/extractContactEmail.ts. Every field is
 * best-effort and independently nullable/false when no signal is present;
 * unlike extractSalary there's no single "nothing found at all" null return
 * because most jobs have at least a partial signal (e.g. seniority) even
 * when others (visa, clearance) don't apply.
 */
export function extractJobAttributes(text: string): JobAttributes {
  return {
    employmentType: firstMatch(text, EMPLOYMENT_TYPE_PATTERNS),
    seniority: firstMatch(text, SENIORITY_PATTERNS),
    workArrangement: firstMatch(text, WORK_ARRANGEMENT_PATTERNS),
    visaSponsorship: tristate(text, VISA_NEGATIVE, VISA_POSITIVE),
    relocationAssistance: tristate(text, RELOCATION_NEGATIVE, RELOCATION_POSITIVE),
    securityClearance: SECURITY_CLEARANCE_PATTERN.test(text),
    urgentHiring: URGENT_HIRING_PATTERN.test(text),
  };
}
