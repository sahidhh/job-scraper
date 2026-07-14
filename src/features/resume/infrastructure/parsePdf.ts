import pdf from "pdf-parse";
import { normalizeWhitespace } from "@/shared/infrastructure/text";

// Extracts whitespace-normalized plain text from a PDF buffer
// (scoring.md §1.3). pdf-parse import is infrastructure-only
// (architecture.md §5 rule 3). A scanned/image-only PDF yields an empty or
// near-empty string here -- that's caught by domain/validateParsedText in
// the application layer, not here, so both PDF and DOCX share one check.
export async function parsePdf(data: Buffer): Promise<string> {
  const result = await pdf(data);
  return normalizeWhitespace(result.text);
}
