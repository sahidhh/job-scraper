import { DomainValidationError } from "@/shared/domain/errors";

export function normalizeSkillName(skill: string): string {
  return skill.trim();
}

// A scanned/image-only PDF (or a corrupt DOCX) makes pdf-parse/mammoth
// return an empty or near-empty string. Silently accepting that would
// create a resume row with no usable content and zero extracted skills,
// with no signal to the user about why. Reject it instead so the failure
// surfaces the same way an unreadable file already does (use-cases.md
// "PDF parse fails -> error message shown; no resume row created").
const MIN_PARSED_TEXT_LENGTH = 20;

export function validateParsedText(text: string): void {
  if (text.trim().length < MIN_PARSED_TEXT_LENGTH) {
    throw new DomainValidationError(
      "Couldn't find readable text in this file -- it may be a scanned image. Upload a text-based PDF or DOCX.",
    );
  }
}

// Skills are canonical dictionary names (scoring.md §1): non-empty,
// deduped case-insensitively.
export function validateSkills(skills: string[]): void {
  const seen = new Set<string>();

  for (const skill of skills) {
    const normalized = normalizeSkillName(skill);

    if (normalized.length === 0) {
      throw new DomainValidationError("Resume skills must not contain empty entries");
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      throw new DomainValidationError(`Duplicate skill: "${normalized}"`);
    }
    seen.add(key);
  }
}
