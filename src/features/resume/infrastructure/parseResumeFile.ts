import type { ParseResumeText } from "@/features/resume/application/uploadResume";
import { parseDocx } from "@/features/resume/infrastructure/parseDocx";
import { parsePdf } from "@/features/resume/infrastructure/parsePdf";

// Single source of truth for which resume file types are accepted and what
// storage-path extension each gets (actions.ts imports this, not a
// duplicate list).
export const RESUME_FILE_EXTENSION_BY_MIME_TYPE = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;

export type SupportedResumeMimeType = keyof typeof RESUME_FILE_EXTENSION_BY_MIME_TYPE;

// Dispatches to the format-specific extractor by MIME type. This is the
// `parseText` port implementation wired into uploadResume() from actions.ts
// (kept out of the application layer so pdf-parse/mammoth stay
// infrastructure-only, architecture.md §5 rule 3).
export const parseResumeFile: ParseResumeText = async (buffer, mimeType) => {
  switch (mimeType) {
    case "application/pdf":
      return parsePdf(buffer);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return parseDocx(buffer);
    default:
      throw new Error(`Unsupported resume file type: ${mimeType}`);
  }
};
